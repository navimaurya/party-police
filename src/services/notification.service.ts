import os from "node:os";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { NotificationLog, PartyBill, PartyCommitment, PartyEvent, ScheduledJob, User, type ScheduledJobDoc } from "@/models";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  recoverAbandonedJobs,
  skipJob,
} from "@/lib/scheduler";
import { isPermanentSmtpError, messageIdFor, sendEmail, type OutgoingEmail } from "@/lib/email";
import * as T from "@/lib/email-templates";
import { publicFileUrl, signedFileUrl } from "@/lib/signed-url";
import { overdueDays, teaseFor } from "@/lib/humor";
import { badRequest, notFound } from "@/lib/errors";
import { assertObjectId } from "@/lib/utils-server";
import { atLocalHour, dayKey, localDayRange } from "@/lib/time";
import { getSettings, isNotificationTypeEnabled, type Settings } from "./settings.service";
import { audit } from "./audit.service";
import { activeUserEmails } from "./user.service";
import { superAdminEmails } from "./auth.service";
import type { NotificationType } from "@/types";

export const WORKER_ID = `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;

/** A welcome email sent within this window makes other queued copies skip. */
export const WELCOME_DEDUPE_MS = 30 * 60 * 1000;

type Job = ScheduledJobDoc & { _id: Types.ObjectId };
type Built = { skip: string } | { to: string[]; cc?: string[]; thread?: OutgoingEmail["thread"]; rendered: T.Rendered };

function uniqueEmails(list: (string | null | undefined)[]) {
  return [...new Set(list.filter((e): e is string => !!e && /.+@.+\..+/.test(e)).map((e) => e.toLowerCase()))];
}

/** Everyone who hears about a party: all active users (members, admins, Super Admin), extra recipients from Settings, and optionally the party's own participants. */
async function eventRecipients(settings: Settings, event: { participants?: { email?: string | null }[]; organizerEmail?: string | null }) {
  const extra = settings.defaultReminderSettings?.sendToEventParticipants
    ? [...(event.participants ?? []).map((p) => p.email), event.organizerEmail]
    : [];
  return uniqueEmails([...(await activeUserEmails()), ...(settings.recipients ?? []), ...extra]);
}

/* Party-day confirmation thread: giver notice (root) -> approval request -> thanks after approval. */
export const partyDayKeys = (eventId: string, day: string) => ({
  members: `party_day:${eventId}:${day}`,
  giver: `party_giver_notice:${eventId}:${day}`,
  approval: `party_approval_request:${eventId}:${day}`,
});
export const giverThanksKey = (eventId: string, version: number) => `party_giver_thanks:${eventId}:v${version}`;
/** The thread root is the giver's notice; its Message-ID is derived from its key. */
const threadRootId = (eventId: string, day: string) => messageIdFor(partyDayKeys(eventId, day).giver);

/**
 * Builds the email for a job from the CURRENT database state.
 * Every job re-validates its preconditions here, right before sending.
 */
async function buildMessage(job: Job, settings: Settings): Promise<Built> {
  if (job.eventId) {
    const event = await PartyEvent.findById(job.eventId).lean();
    if (!event) return { skip: "Event no longer exists" };
    const prefs: Partial<NonNullable<typeof event.notificationPreferences>> = event.notificationPreferences ?? {};
    const to = () => eventRecipients(settings, event);

    switch (job.jobType) {
      case "thank_you": {
        if (event.status !== "completed") return { skip: "Event is no longer completed" };
        if (event.completionVersion !== job.completionVersion) return { skip: "Stale completion version" };
        if (prefs.thankYou === false) return { skip: "Thank-you disabled for this event" };
        const bills: { name: string; url: string }[] = [];
        if (settings.thankYou?.includeBillLinks !== false && prefs.includeBillLinks !== false) {
          const docs = await PartyBill.find({ eventId: event._id }).sort({ uploadedAt: 1 }).lean();
          const ttl = (settings.thankYou?.privateLinkTtlHours ?? 72) * 3600;
          for (const b of docs) {
            if (b.isPublic && event.publicVisibility) bills.push({ name: b.originalFileName, url: publicFileUrl(String(b._id)) });
            else if (settings.thankYou?.includePrivateBillLinks)
              bills.push({ name: `${b.originalFileName} (private link, expires)`, url: signedFileUrl(String(b._id), "view", ttl).url });
          }
        }
        return { to: await to(), rendered: T.thankYouEmail(event, bills) };
      }
      case "upcoming_reminder": {
        if (event.status !== "upcoming") return { skip: "Event is not upcoming" };
        if (prefs.reminders === false) return { skip: "Reminders disabled for this event" };
        if (job.payload?.eventDate && new Date(String(job.payload.eventDate)).getTime() !== new Date(event.eventDate).getTime())
          return { skip: "Event date changed since reminder was scheduled" };
        if (new Date(event.eventDate).getTime() < Date.now()) return { skip: "Event already started" };
        return { to: await to(), rendered: T.reminderEmail(event, Number(job.payload?.hoursBefore ?? 24)) };
      }
      case "instant_announcement":
        if (event.status !== "upcoming") return { skip: "Instant party is no longer live" };
        if (prefs.announcement === false) return { skip: "Announcement disabled for this event" };
        return { to: await to(), rendered: T.instantAnnouncementEmail(event) };
      case "event_update":
        if (event.status !== "upcoming") return { skip: "Event is not upcoming" };
        if (prefs.updates === false) return { skip: "Updates disabled for this event" };
        return { to: await to(), rendered: T.eventUpdateEmail(event) };
      case "event_cancelled":
        if (event.status !== "cancelled") return { skip: "Event is no longer cancelled" };
        return { to: await to(), rendered: T.eventCancelledEmail(event) };

      case "party_day":
      case "party_giver_notice":
      case "party_approval_request": {
        const day = String(job.payload?.dayKey ?? "");
        if (event.status !== "upcoming") return { skip: `Party is ${event.status}` };
        if (dayKey(event.eventDate) !== day) return { skip: "Party date changed; it is no longer on this day" };
        const subject = event.confirmationThread?.subject || T.confirmationThreadSubject(event);
        const eventId = String(event._id);
        if (job.jobType === "party_day") {
          return { to: uniqueEmails(await activeUserEmails()), rendered: T.partyDayEmail(event) };
        }
        if (job.jobType === "party_giver_notice") {
          if (!event.organizerEmail) return { skip: "The party giver has no email address" };
          return {
            to: [event.organizerEmail],
            thread: { messageId: threadRootId(eventId, day) },
            rendered: T.giverNoticeEmail(event, subject),
          };
        }
        const root = threadRootId(eventId, day);
        return {
          to: uniqueEmails(await superAdminEmails()),
          thread: { inReplyTo: event.organizerEmail ? root : undefined, references: event.organizerEmail ? [root] : undefined },
          rendered: T.approvalRequestEmail(event, subject, event.organizerEmail),
        };
      }

      case "party_giver_thanks": {
        if (event.status !== "completed") return { skip: "Party is no longer approved" };
        if (event.completionVersion !== job.completionVersion) return { skip: "Stale approval" };
        if (!event.organizerEmail) return { skip: "The party giver has no email address" };
        const giver = event.organizerEmail.toLowerCase();
        const day = event.confirmationThread?.dayKey || dayKey(event.eventDate);
        const subject = event.confirmationThread?.subject || T.confirmationThreadSubject(event);
        const root = threadRootId(String(event._id), day);
        return {
          to: [giver],
          // The Super Admin is copied so the thread is closed in their inbox too.
          cc: uniqueEmails(await superAdminEmails()).filter((e) => e !== giver),
          thread: { inReplyTo: root, references: [root] },
          rendered: T.giverThanksEmail(event, subject, event.approvedAt ?? event.completedAt ?? new Date()),
        };
      }
      default:
        return { skip: `Job type ${job.jobType} does not apply to events` };
    }
  }

  if (job.commitmentId) {
    const c = await PartyCommitment.findById(job.commitmentId).lean();
    if (!c) return { skip: "Commitment no longer exists" };
    if (c.status !== "pending") return { skip: "Commitment is no longer pending" };
    const days = overdueDays(c.dueDate);
    if (job.jobType === "defaulter_reminder") {
      const to = uniqueEmails([c.personEmail]);
      return { to, rendered: T.defaulterReminderEmail(c, days, teaseFor(days)) };
    }
    if (job.jobType === "overdue_notice") {
      if (days <= 0) return { skip: "Not overdue anymore" };
      return { to: uniqueEmails([...(settings.recipients ?? []), c.personEmail]), rendered: T.overdueNoticeEmail(c, days) };
    }
  }
  if (job.jobType === "user_welcome" && job.userId) {
    const user = await User.findById(job.userId).lean();
    if (!user) return { skip: "User no longer exists" };
    if (!user.isActive) return { skip: "User is inactive" };
    // Several queued copies (e.g. resends while the mail server was down) send only once.
    const recent = await NotificationLog.exists({
      notificationType: "user_welcome",
      userId: user._id,
      status: "sent",
      sentAt: { $gte: new Date(Date.now() - WELCOME_DEDUPE_MS) },
      idempotencyKey: { $ne: job.idempotencyKey },
    });
    if (recent) return { skip: "A welcome email was just sent to this user" };
    return { to: [user.email], rendered: T.welcomeEmail(user) };
  }
  return { skip: "Job has no target" };
}

/**
 * Delivery-state guard. One NotificationLog per idempotency key.
 * - "sent"      -> never send again
 * - "sending"   -> a previous attempt crashed mid-send; delivery is UNKNOWN, so we do not
 *                  auto-resend (an admin can retry manually and accept the duplicate risk)
 * - "failed"    -> may be retried
 */
async function acquireDeliverySlot(job: Job, to: string[], subject: string) {
  const key = job.idempotencyKey;
  const existing = await NotificationLog.findOne({ idempotencyKey: key }).lean();
  if (existing?.status === "sent") return { state: "already_sent" as const };
  if (existing?.status === "sending" || existing?.status === "uncertain") {
    await NotificationLog.updateOne({ _id: existing._id, status: "sending" }, { $set: { status: "uncertain", errorMessage: "Previous attempt was interrupted; delivery unknown" } });
    return { state: "uncertain" as const };
  }
  if (existing) {
    const claimed = await NotificationLog.findOneAndUpdate(
      { _id: existing._id, status: { $in: ["failed", "skipped"] } },
      { $set: { status: "sending", recipient: to, subject, retryCount: job.retryCount, jobId: job._id } },
      { returnDocument: "after" }
    ).lean();
    return claimed ? { state: "acquired" as const } : { state: "busy" as const };
  }
  try {
    await NotificationLog.create({
      idempotencyKey: key,
      eventId: job.eventId,
      commitmentId: job.commitmentId,
      userId: job.userId,
      jobId: job._id,
      recipient: to,
      subject,
      notificationType: job.jobType,
      status: "sending",
      scheduledAt: job.scheduledAt,
      retryCount: job.retryCount,
    });
    return { state: "acquired" as const };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { state: "busy" as const };
    throw err;
  }
}

async function logSkip(job: Job, reason: string) {
  await NotificationLog.updateOne(
    { idempotencyKey: job.idempotencyKey },
    {
      $setOnInsert: {
        idempotencyKey: job.idempotencyKey,
        eventId: job.eventId,
        commitmentId: job.commitmentId,
        userId: job.userId,
        jobId: job._id,
        notificationType: job.jobType,
        scheduledAt: job.scheduledAt,
        status: "skipped",
        errorMessage: reason,
      },
    },
    { upsert: true }
  ).catch(() => undefined);
}

export async function processJob(job: Job, workerId = WORKER_ID) {
  const settings = await getSettings();
  if (!isNotificationTypeEnabled(settings, job.jobType as NotificationType)) {
    await skipJob(job._id, workerId, "Notifications disabled");
    await logSkip(job, "Notifications disabled");
    return { outcome: "skipped" as const, reason: "Notifications disabled" };
  }

  let built: Built;
  try {
    built = await buildMessage(job, settings);
  } catch (err) {
    const { willRetry } = await failJob(job, workerId, `Build failed: ${(err as Error).message}`, { retryable: true });
    return { outcome: willRetry ? ("retry" as const) : ("failed" as const) };
  }
  if ("skip" in built) {
    await skipJob(job._id, workerId, built.skip);
    await logSkip(job, built.skip);
    return { outcome: "skipped" as const, reason: built.skip };
  }
  if (built.to.length === 0) {
    await skipJob(job._id, workerId, "No recipients configured");
    await logSkip(job, "No recipients configured");
    return { outcome: "skipped" as const, reason: "No recipients configured" };
  }

  const slot = await acquireDeliverySlot(job, [...built.to, ...(built.cc ?? [])], built.rendered.subject);
  if (slot.state === "already_sent") {
    await completeJob(job._id, workerId);
    return { outcome: "duplicate_prevented" as const };
  }
  if (slot.state === "uncertain") {
    await failJob(job, workerId, "Delivery uncertain after interrupted attempt; manual retry required", { retryable: false });
    return { outcome: "uncertain" as const };
  }
  if (slot.state === "busy") {
    // Another worker holds the delivery slot; let it finish.
    await skipJob(job._id, workerId, "Delivery slot held by another worker");
    return { outcome: "busy" as const };
  }

  try {
    const res = await sendEmail({ ...built.rendered, to: built.to, cc: built.cc, thread: built.thread, idempotencyKey: job.idempotencyKey });
    await NotificationLog.updateOne(
      { idempotencyKey: job.idempotencyKey },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          messageId: res.messageId,
          smtpResponse: res.response ?? "",
          // Some recipients refused by the server are recorded, not hidden.
          errorMessage: res.rejected?.length ? `Rejected by SMTP server: ${res.rejected.join(", ")}` : "",
        },
      }
    );
    await completeJob(job._id, workerId);
    return { outcome: "sent" as const };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await NotificationLog.updateOne(
      { idempotencyKey: job.idempotencyKey },
      { $set: { status: "failed", errorMessage: message.slice(0, 1000) }, $inc: { retryCount: 1 } }
    );
    const { willRetry } = await failJob(job, workerId, message, { retryable: !isPermanentSmtpError(err) });
    return { outcome: willRetry ? ("retry" as const) : ("failed" as const), error: message };
  }
}

/** Scans upcoming events and pending commitments and enqueues due reminders (idempotent). */
export async function enqueueRecurringNotifications(now = new Date()) {
  const settings = await getSettings();
  if (!settings.notificationEnabled) return { reminders: 0, defaulters: 0, overdue: 0, partyDay: 0 };
  let reminders = 0;
  let defaulters = 0;
  let overdue = 0;

  const intervals = [...(settings.reminderIntervals ?? [24, 2])].sort((a, b) => a - b);
  if (intervals.length && isNotificationTypeEnabled(settings, "upcoming_reminder")) {
    const horizon = new Date(now.getTime() + intervals[intervals.length - 1] * 3600_000);
    const events = await PartyEvent.find({
      status: "upcoming",
      eventType: "scheduled",
      eventDate: { $gt: now, $lte: horizon },
      "notificationPreferences.reminders": { $ne: false },
    })
      .select({ eventDate: 1 })
      .lean();
    for (const e of events) {
      const hoursLeft = (new Date(e.eventDate).getTime() - now.getTime()) / 3600_000;
      // Only the tightest interval that applies, so a late-created event gets one reminder, not several.
      const h = intervals.find((i) => hoursLeft <= i);
      if (h === undefined) continue;
      const res = await enqueueJob({
        jobType: "upcoming_reminder",
        idempotencyKey: `upcoming_reminder:${String(e._id)}:${h}h:${new Date(e.eventDate).getTime()}`,
        scheduledAt: now,
        eventId: e._id,
        payload: { hoursBefore: h, eventDate: new Date(e.eventDate).toISOString() },
      });
      if (res.created) reminders++;
    }
  }

  const everyDays = settings.defaultReminderSettings?.defaulterReminderEveryDays ?? 7;
  const overdueAfter = settings.defaultReminderSettings?.overdueNoticeAfterDays ?? 1;
  const pending = await PartyCommitment.find({ status: "pending" })
    .select({ commitmentDate: 1, dueDate: 1, personEmail: 1 })
    .lean();
  for (const c of pending) {
    if (c.personEmail && isNotificationTypeEnabled(settings, "defaulter_reminder")) {
      const daysSince = Math.floor((now.getTime() - new Date(c.commitmentDate).getTime()) / 86400_000);
      if (daysSince >= everyDays) {
        const bucket = Math.floor(daysSince / everyDays);
        const res = await enqueueJob({
          jobType: "defaulter_reminder",
          idempotencyKey: `defaulter_reminder:${String(c._id)}:b${bucket}`,
          scheduledAt: now,
          commitmentId: c._id,
        });
        if (res.created) defaulters++;
      }
    }
    if (isNotificationTypeEnabled(settings, "overdue_notice") && overdueDays(c.dueDate, now) >= Math.max(overdueAfter, 1)) {
      const res = await enqueueJob({
        jobType: "overdue_notice",
        idempotencyKey: `overdue_notice:${String(c._id)}:${new Date(c.dueDate).getTime()}`,
        scheduledAt: now,
        commitmentId: c._id,
      });
      if (res.created) overdue++;
    }
  }
  const partyDay = await enqueuePartyDayNotifications(settings, now);
  return { reminders, defaulters, overdue, partyDay };
}

/**
 * Daily party-day emails at settings.partyDay.sendAtHour (default 9 AM, APP_TIMEZONE):
 * all members ("today we will have a party"), the party giver, and the Super Admin
 * (approval request). The giver + Super Admin emails share one subject and thread.
 * Jobs are queued for 9 AM whenever the scan sees a party today, so they fire on time;
 * parties added later in the day are announced on the next scan.
 */
export async function enqueuePartyDayNotifications(settings: Settings, now = new Date()) {
  const day = dayKey(now);
  const { start, end } = localDayRange(day);
  const sendAt = atLocalHour(day, settings.partyDay?.sendAtHour ?? 9);
  const events = await PartyEvent.find({ status: "upcoming", eventDate: { $gte: start, $lt: end } })
    .select({ title: 1, eventDate: 1, eventType: 1, organizerEmail: 1, confirmationThread: 1 })
    .lean();
  let queued = 0;
  for (const e of events) {
    const id = String(e._id);
    const keys = partyDayKeys(id, day);
    // Fix the thread subject now, so later title edits don't break the thread.
    if (e.confirmationThread?.dayKey !== day) {
      await PartyEvent.updateOne({ _id: e._id }, { $set: { confirmationThread: { dayKey: day, subject: T.confirmationThreadSubject(e) } } });
    }
    const jobs: { type: NotificationType; key: string }[] = [
      // Instant parties were already announced to everyone the moment they were created.
      ...(e.eventType === "scheduled" ? [{ type: "party_day" as const, key: keys.members }] : []),
      ...(e.organizerEmail ? [{ type: "party_giver_notice" as const, key: keys.giver }] : []),
      { type: "party_approval_request", key: keys.approval },
    ];
    for (const j of jobs) {
      if (!isNotificationTypeEnabled(settings, j.type)) continue;
      // The approval request goes right after the giver's notice, so the thread reads in order.
      const at = j.type === "party_approval_request" ? new Date(sendAt.getTime() + 1000) : sendAt;
      const res = await enqueueJob({ jobType: j.type, idempotencyKey: j.key, scheduledAt: at, eventId: e._id, payload: { dayKey: day } });
      if (res.created) queued++;
    }
  }
  return queued;
}

let lastRecurringScan = 0;
const RECURRING_SCAN_INTERVAL_MS = 5 * 60 * 1000;

/** One worker iteration: recover abandoned jobs, enqueue recurring reminders, drain due jobs. */
export async function runWorkerTick(opts: { workerId?: string; maxJobs?: number; forceScan?: boolean } = {}) {
  await connectDB();
  const workerId = opts.workerId ?? WORKER_ID;
  const recovered = await recoverAbandonedJobs();
  let scanned = null;
  if (opts.forceScan || Date.now() - lastRecurringScan > RECURRING_SCAN_INTERVAL_MS) {
    lastRecurringScan = Date.now();
    scanned = await enqueueRecurringNotifications();
  }
  const results: { jobId: string; type: string; outcome: string }[] = [];
  for (let i = 0; i < (opts.maxJobs ?? 25); i++) {
    const job = (await claimNextJob(workerId)) as Job | null;
    if (!job) break;
    try {
      const r = await processJob(job, workerId);
      results.push({ jobId: String(job._id), type: job.jobType, outcome: r.outcome });
    } catch (err) {
      console.error("[worker] job crashed", job._id, err);
      await failJob(job, workerId, (err as Error).message ?? "crash", { retryable: true });
      results.push({ jobId: String(job._id), type: job.jobType, outcome: "error" });
    }
  }
  return { recovered, scanned, processed: results };
}

/**
 * Admin-initiated retry of a failed/uncertain notification. Explicit admin
 * action is the only way an "uncertain" delivery is re-attempted.
 */
export async function retryJob(jobId: string, actorId: string) {
  await connectDB();
  const _id = assertObjectId(jobId, "job id");
  const job = await ScheduledJob.findById(_id).lean();
  if (!job) throw notFound("Job not found");
  if (!["failed", "skipped", "cancelled"].includes(job.status)) throw badRequest(`Cannot retry a ${job.status} job`);
  const log = await NotificationLog.findOne({ idempotencyKey: job.idempotencyKey }).lean();
  if (log?.status === "sent") throw badRequest("This email was already sent. Retrying would create a duplicate.");
  if (log) await NotificationLog.updateOne({ _id: log._id }, { $set: { status: "failed" } });
  await ScheduledJob.updateOne(
    { _id, status: job.status },
    { $set: { status: "pending", scheduledAt: new Date(), lockedAt: null, lockedBy: null, retryCount: 0 } }
  );
  await audit({ action: "notification.retry", entityType: "ScheduledJob", entityId: jobId, actorId });
}

export async function cancelJob(jobId: string, actorId: string) {
  await connectDB();
  const _id = assertObjectId(jobId, "job id");
  const res = await ScheduledJob.updateOne({ _id, status: "pending" }, { $set: { status: "cancelled", lastError: "Cancelled by admin" } });
  if (!res.modifiedCount) throw badRequest("Only pending jobs can be cancelled");
  await audit({ action: "notification.cancel", entityType: "ScheduledJob", entityId: jobId, actorId });
}

export async function listJobs(opts: { page: number; limit: number; status?: string }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  const [items, total] = await Promise.all([
    ScheduledJob.find(filter)
      .sort({ scheduledAt: -1 })
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .populate("eventId", "title")
      .populate("commitmentId", "personName")
      .populate("userId", "name email")
      .lean(),
    ScheduledJob.countDocuments(filter),
  ]);
  return { items, total };
}

export async function listLogs(opts: { page: number; limit: number; status?: string; type?: string }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  if (opts.type) filter.notificationType = opts.type;
  const [items, total] = await Promise.all([
    NotificationLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .populate("eventId", "title")
      .populate("userId", "name email")
      .lean(),
    NotificationLog.countDocuments(filter),
  ]);
  return { items, total };
}

export async function sendTestEmail(to: string, actorId: string) {
  const r = T.testEmail();
  const key = `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const log = await NotificationLog.create({
    idempotencyKey: key,
    recipient: [to],
    subject: r.subject,
    notificationType: "event_update",
    status: "sending",
  });
  try {
    const { messageId } = await sendEmail({ ...r, to: [to], idempotencyKey: key });
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: "sent", sentAt: new Date(), messageId } });
    await audit({ action: "notification.test_email", entityType: "NotificationLog", entityId: String(log._id), actorId });
  } catch (err) {
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: "failed", errorMessage: (err as Error).message } });
    throw badRequest(`SMTP error: ${(err as Error).message}`);
  }
}

export async function listEventJobs(eventId: string) {
  await connectDB();
  const _id = assertObjectId(eventId, "event id");
  return ScheduledJob.find({ eventId: _id }).sort({ scheduledAt: -1 }).limit(30).lean();
}
