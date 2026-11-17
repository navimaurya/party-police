import type { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { PartyCommitment, PartyEvent } from "@/models";
import { notFound } from "@/lib/errors";
import { assertObjectId, escapeRegex } from "@/lib/utils-server";
import { cancelPendingCommitmentJobs } from "@/lib/scheduler";
import { overdueDays, teaseFor } from "@/lib/humor";
import type { CommitmentCreateSchema, CommitmentListQuerySchema, CommitmentUpdateSchema } from "@/lib/validation";
import { audit } from "./audit.service";
import { mongoSort, parseSort, TEXT_COLLATION } from "@/lib/sort";
import { COMMITMENT_DEFAULT_SORT, COMMITMENT_SORT_FIELDS } from "@/lib/sort-fields";

type CreateInput = z.infer<typeof CommitmentCreateSchema>;
type UpdateInput = z.infer<typeof CommitmentUpdateSchema>;
type ListQuery = z.infer<typeof CommitmentListQuerySchema>;

async function assertEventExists(id: string | null | undefined) {
  if (!id) return null;
  const _id = assertObjectId(id, "related event id");
  if (!(await PartyEvent.exists({ _id }))) throw notFound("Related event not found");
  return _id;
}

export async function listCommitments(query: ListQuery, opts: { admin: boolean }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (!opts.admin) filter.isPublic = true;
  if (query.status) filter.status = query.status;
  if (query.overdue === "true") {
    filter.status = "pending";
    filter.dueDate = { $lt: new Date() };
  }
  if (query.q) {
    const rx = { $regex: escapeRegex(query.q), $options: "i" };
    filter.$or = [{ personName: rx }, { reason: rx }];
  }
  const [items, total] = await Promise.all([
    PartyCommitment.find(filter)
      .sort(mongoSort(parseSort(query.sort, COMMITMENT_SORT_FIELDS, COMMITMENT_DEFAULT_SORT), { dueDate: 1, _id: 1 }))
      .collation(TEXT_COLLATION)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select(opts.admin ? {} : { personEmail: 0, notes: 0 })
      .populate("relatedEventId", "title eventDate status")
      .lean(),
    PartyCommitment.countDocuments(filter),
  ]);
  return { items: items.map(withOverdue), total };
}

function withOverdue<T extends { dueDate: Date; status: string }>(c: T) {
  const days = c.status === "pending" ? overdueDays(c.dueDate) : 0;
  return { ...c, overdueDays: days, tease: c.status === "pending" ? teaseFor(days) : "Legend status unlocked 🏆" };
}

/** Pending commitments sorted by most overdue first. */
export async function getHallOfShame(opts: { admin?: boolean; limit?: number } = {}) {
  await connectDB();
  const items = await PartyCommitment.find({ status: "pending", ...(opts.admin ? {} : { isPublic: true }) })
    .sort({ dueDate: 1 })
    .limit(opts.limit ?? 100)
    .select({ personEmail: 0, notes: 0 })
    .lean();
  return items.map(withOverdue).sort((a, b) => b.overdueDays - a.overdueDays);
}

/** Completed commitments + a leaderboard of hosts by completed parties. */
export async function getPartyLegends(opts: { limit?: number } = {}) {
  await connectDB();
  const [recent, leaderboard] = await Promise.all([
    PartyCommitment.find({ status: "completed", isPublic: true })
      .sort({ completedAt: -1 })
      .limit(opts.limit ?? 20)
      .select({ personEmail: 0, notes: 0 })
      .populate("relatedEventId", "title eventDate")
      .lean(),
    PartyEvent.aggregate<{ _id: string; parties: number; totalBudget: number; lastParty: Date }>([
      { $match: { status: "completed", publicVisibility: true } },
      {
        $group: {
          _id: "$organizerName",
          parties: { $sum: 1 },
          totalBudget: { $sum: { $ifNull: ["$budget", 0] } },
          lastParty: { $max: "$eventDate" },
        },
      },
      { $sort: { parties: -1, lastParty: -1 } },
      { $limit: 10 },
    ]),
  ]);
  return { recent, leaderboard };
}

export async function createCommitment(input: CreateInput, actorId: string) {
  await connectDB();
  const relatedEventId = await assertEventExists(input.relatedEventId);
  const doc = await PartyCommitment.create({
    ...input,
    relatedEventId,
    completedAt: input.status === "completed" ? new Date() : null,
  });
  await audit({ action: "commitment.create", entityType: "PartyCommitment", entityId: String(doc._id), actorId, newValue: input });
  return doc.toObject();
}

export async function updateCommitment(id: string, input: UpdateInput, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id);
  const before = await PartyCommitment.findById(_id).lean();
  if (!before) throw notFound("Commitment not found");
  const $set: Record<string, unknown> = { ...input };
  if (input.relatedEventId !== undefined) $set.relatedEventId = await assertEventExists(input.relatedEventId);
  if (input.status && input.status !== before.status) {
    $set.completedAt = input.status === "completed" ? new Date() : null;
    if (input.status !== "pending") await cancelPendingCommitmentJobs(_id);
  }
  const after = await PartyCommitment.findByIdAndUpdate(_id, { $set }, { returnDocument: "after", runValidators: true }).lean();
  await audit({ action: "commitment.update", entityType: "PartyCommitment", entityId: id, actorId, previousValue: before, newValue: after });
  return after!;
}

export async function deleteCommitment(id: string, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id);
  const before = await PartyCommitment.findByIdAndDelete(_id).lean();
  if (!before) throw notFound("Commitment not found");
  await cancelPendingCommitmentJobs(_id);
  await audit({ action: "commitment.delete", entityType: "PartyCommitment", entityId: id, actorId, previousValue: before });
}
