import { Types } from "mongoose";
import { ScheduledJob, type ScheduledJobDoc } from "@/models";
import type { NotificationType } from "@/types";

/**
 * MongoDB-backed persistent job store.
 *
 * - Jobs survive restarts because they live in MongoDB, not memory.
 * - `idempotencyKey` has a unique index, so the same logical job can never be enqueued twice.
 * - Workers claim jobs with a single atomic findOneAndUpdate, so two workers can never
 *   process the same job concurrently.
 * - Jobs stuck in "processing" (worker crashed) are recovered after LOCK_TIMEOUT_MS.
 */

export const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const BACKOFF_SCHEDULE_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function backoffMs(retryCount: number) {
  return BACKOFF_SCHEDULE_MS[Math.min(Math.max(retryCount - 1, 0), BACKOFF_SCHEDULE_MS.length - 1)];
}

export type EnqueueInput = {
  jobType: NotificationType;
  idempotencyKey: string;
  scheduledAt: Date;
  eventId?: string | Types.ObjectId | null;
  commitmentId?: string | Types.ObjectId | null;
  userId?: string | Types.ObjectId | null;
  completionVersion?: number | null;
  payload?: Record<string, unknown>;
  maxRetries?: number;
};

/** Inserts the job unless one with the same idempotency key already exists. */
export async function enqueueJob(input: EnqueueInput): Promise<{ created: boolean }> {
  try {
    const res = await ScheduledJob.updateOne(
      { idempotencyKey: input.idempotencyKey },
      {
        $setOnInsert: {
          jobType: input.jobType,
          idempotencyKey: input.idempotencyKey,
          scheduledAt: input.scheduledAt,
          eventId: input.eventId ?? null,
          commitmentId: input.commitmentId ?? null,
          userId: input.userId ?? null,
          completionVersion: input.completionVersion ?? null,
          payload: input.payload ?? {},
          maxRetries: input.maxRetries ?? 3,
          status: "pending",
          retryCount: 0,
        },
      },
      { upsert: true }
    );
    return { created: res.upsertedCount === 1 };
  } catch (err) {
    // Two concurrent upserts on the same unique key: the loser gets E11000. Same outcome = already queued.
    if ((err as { code?: number }).code === 11000) return { created: false };
    throw err;
  }
}

/** Cancels jobs that have not started yet. Processing jobs re-check state before sending. */
export async function cancelPendingJobs(filter: { eventId: string | Types.ObjectId; jobTypes?: NotificationType[] }) {
  const q: Record<string, unknown> = { eventId: new Types.ObjectId(String(filter.eventId)), status: "pending" };
  if (filter.jobTypes?.length) q.jobType = { $in: filter.jobTypes };
  const res = await ScheduledJob.updateMany(q, { $set: { status: "cancelled", lastError: "Cancelled" } });
  return res.modifiedCount;
}

export async function cancelPendingCommitmentJobs(commitmentId: string | Types.ObjectId) {
  const res = await ScheduledJob.updateMany(
    { commitmentId: new Types.ObjectId(String(commitmentId)), status: "pending" },
    { $set: { status: "cancelled", lastError: "Cancelled" } }
  );
  return res.modifiedCount;
}

/** Atomically claims the oldest due job. Returns null when nothing is due. */
export async function claimNextJob(workerId: string, now = new Date()) {
  return ScheduledJob.findOneAndUpdate(
    { status: "pending", scheduledAt: { $lte: now } },
    { $set: { status: "processing", lockedAt: now, lockedBy: workerId, lastAttemptAt: now } },
    { sort: { scheduledAt: 1 }, returnDocument: "after" }
  ).lean();
}

/** Returns jobs whose worker died mid-processing back to the queue. */
export async function recoverAbandonedJobs(now = new Date(), lockTimeoutMs = LOCK_TIMEOUT_MS) {
  const res = await ScheduledJob.updateMany(
    { status: "processing", lockedAt: { $lt: new Date(now.getTime() - lockTimeoutMs) } },
    { $set: { status: "pending", lockedAt: null, lockedBy: null, lastError: "Recovered after worker timeout" } }
  );
  return res.modifiedCount;
}

type JobId = Types.ObjectId | string;

/** All terminal transitions are guarded by lockedBy so a recovered/reclaimed job can't be clobbered. */
export async function completeJob(id: JobId, workerId: string) {
  await ScheduledJob.updateOne(
    { _id: id, status: "processing", lockedBy: workerId },
    { $set: { status: "completed", lockedAt: null, lastError: "" } }
  );
}

export async function skipJob(id: JobId, workerId: string, reason: string) {
  await ScheduledJob.updateOne(
    { _id: id, status: "processing", lockedBy: workerId },
    { $set: { status: "skipped", lockedAt: null, lastError: reason } }
  );
}

export async function failJob(
  job: Pick<ScheduledJobDoc, "retryCount" | "maxRetries"> & { _id: JobId },
  workerId: string,
  error: string,
  opts: { retryable: boolean; now?: Date }
) {
  const now = opts.now ?? new Date();
  const retryCount = (job.retryCount ?? 0) + 1;
  const canRetry = opts.retryable && retryCount <= (job.maxRetries ?? 3);
  await ScheduledJob.updateOne(
    { _id: job._id, status: "processing", lockedBy: workerId },
    {
      $set: {
        status: canRetry ? "pending" : "failed",
        retryCount,
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 1000),
        ...(canRetry ? { scheduledAt: new Date(now.getTime() + backoffMs(retryCount)) } : {}),
      },
    }
  );
  return { willRetry: canRetry, retryCount };
}
