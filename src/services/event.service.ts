import type { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { User, PartyBill, PartyCommitment, PartyEvent, ScheduledJob, type PartyEventDoc } from "@/models";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { assertObjectId, escapeRegex } from "@/lib/utils-server";
import { cancelPendingJobs, enqueueJob } from "@/lib/scheduler";
import { deleteEventStorage, deleteStoredFile } from "@/lib/storage";
import { env } from "@/config/env";
import { mongoSort, parseSort, TEXT_COLLATION } from "@/lib/sort";
import { EVENT_DEFAULT_SORT, EVENT_SORT_FIELDS } from "@/lib/sort-fields";
import type { CreateEventSchema, EventListQuerySchema, UpdateEventSchema } from "@/lib/validation";
import type { EventStatus } from "@/types";
import { enforceBudget } from "./budget.service";
import { audit } from "./audit.service";
import { giverThanksKey } from "./notification.service";

export const EVENT_UPDATE_DEBOUNCE_MS = 2 * 60 * 1000;
const NOTIFY_FIELDS = ["title", "eventDate", "location", "organizerName", "occasion", "description"] as const;

type CreateInput = z.infer<typeof CreateEventSchema>;
type UpdateInput = z.infer<typeof UpdateEventSchema>;
type ListQuery = z.infer<typeof EventListQuerySchema>;

const DEFAULT_PREFS = { reminders: true, announcement: true, updates: true, thankYou: true, includeBillLinks: true };

export function thankYouKey(eventId: string, version: number) {
  return `thank_you:${eventId}:v${version}`;
}

export async function listEvents(query: ListQuery, opts: { admin: boolean }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (!opts.admin) filter.publicVisibility = true;
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.eventType) filter.eventType = query.eventType;
  if (query.from || query.to) {
    filter.eventDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  }
  if (query.q) {
    const rx = { $regex: escapeRegex(query.q), $options: "i" };
    filter.$or = [{ title: rx }, { organizerName: rx }, { occasion: rx }, { location: rx }];
  }
  const sort = parseSort(query.sort, EVENT_SORT_FIELDS, EVENT_DEFAULT_SORT);
  const [items, total] = await Promise.all([
    PartyEvent.find(filter)
      // Tiebreak on party date, so e.g. "by host" lists each host's parties in date order.
      .sort(mongoSort(sort, sort.field === "eventDate" ? { _id: 1 } : { eventDate: 1, _id: 1 }))
      .collation(TEXT_COLLATION)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select(opts.admin ? {} : { "participants.email": 0, organizerEmail: 0 })
      .lean(),
    PartyEvent.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getEvent(id: string, opts: { admin: boolean }) {
  await connectDB();
  const _id = assertObjectId(id, "event id");
  const event = await PartyEvent.findOne(opts.admin ? { _id } : { _id, publicVisibility: true })
    .select(opts.admin ? {} : { "participants.email": 0, organizerEmail: 0 })
    .lean();
  if (!event) throw notFound("Party not found. Maybe it was just a rumour? 🤔");
  return event;
}

export async function getCalendarEvents(from: Date, to: Date, opts: { admin: boolean }) {
  await connectDB();
  if (to <= from) throw badRequest("`to` must be after `from`");
  if (to.getTime() - from.getTime() > 100 * 24 * 3600 * 1000) throw badRequest("Range too large (max 100 days)");
  const filter: Record<string, unknown> = { eventDate: { $gte: from, $lte: to } };
  if (!opts.admin) filter.publicVisibility = true;
  return PartyEvent.find(filter)
    .sort({ eventDate: 1 })
    .limit(500)
    .select({ title: 1, eventType: 1, category: 1, organizerName: 1, eventDate: 1, status: 1, location: 1, occasion: 1 })
    .lean();
}

export async function createEvent(input: CreateInput, actorId: string) {
  await connectDB();
  const { budgetOverride, ...data } = input;
  const eventDate = data.eventDate ?? new Date();
  const _id = new Types.ObjectId();
  const { overridden } = await enforceBudget({
    category: data.category,
    budget: data.budget,
    override: budgetOverride,
    actorId,
    eventId: String(_id),
  });

  const now = new Date();
  const isCompleted = data.status === "completed";
  const doc = await PartyEvent.create({
    _id,
    ...data,
    eventDate,
    budget: data.budget ?? null,
    notificationPreferences: { ...DEFAULT_PREFS, ...(data.notificationPreferences ?? {}) },
    completedAt: isCompleted ? now : null,
    approvedAt: isCompleted ? now : null,
    approvedBy: isCompleted && Types.ObjectId.isValid(actorId) ? actorId : null,
    completionVersion: isCompleted ? 1 : 0,
  });
  const event = doc.toObject();
  await audit({
    action: "event.create",
    entityType: "PartyEvent",
    entityId: String(_id),
    actorId,
    newValue: event,
    reason: overridden ? `Budget override: ${budgetOverride?.reason ?? ""}` : "",
  });

  if (event.eventType === "instant" && event.status === "upcoming" && event.notificationPreferences?.announcement) {
    await enqueueJob({
      jobType: "instant_announcement",
      idempotencyKey: `instant_announcement:${String(_id)}`,
      scheduledAt: now,
      eventId: _id,
    });
  }
  if (isCompleted) await onCompleted(event, actorId);
  return event;
}

export async function updateEvent(id: string, input: UpdateInput, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id, "event id");
  const before = await PartyEvent.findById(_id).lean();
  if (!before) throw notFound("Party not found");
  const { budgetOverride, notificationPreferences, ...rest } = input;

  const nextCategory = rest.category ?? before.category;
  const nextBudget = rest.budget !== undefined ? rest.budget : before.budget;
  const budgetTouched =
    (rest.budget !== undefined && rest.budget !== before.budget) ||
    (rest.category !== undefined && rest.category !== before.category);
  let overridden = false;
  if (budgetTouched) {
    ({ overridden } = await enforceBudget({
      category: nextCategory,
      budget: nextBudget,
      override: budgetOverride,
      actorId,
      eventId: id,
    }));
  }

  const $set: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (notificationPreferences) {
    for (const [k, v] of Object.entries(notificationPreferences)) {
      if (v !== undefined) $set[`notificationPreferences.${k}`] = v;
    }
  }
  const $inc: Record<string, number> = { revision: 1 };
  const nextStatus: EventStatus = rest.status ?? before.status;
  const becameCompleted = before.status !== "completed" && nextStatus === "completed";
  const leftCompleted = before.status === "completed" && nextStatus !== "completed";
  if (becameCompleted) {
    // Completing a party = an admin approving that it was given.
    const now = new Date();
    const approver = Types.ObjectId.isValid(actorId) ? await User.findById(actorId).select({ email: 1 }).lean() : null;
    $set.completedAt = now;
    $set.approvedAt = now;
    $set.approvedBy = approver?._id ?? null;
    $set.approvedByEmail = approver?.email ?? "";
    $inc.completionVersion = 1;
  } else if (leftCompleted) {
    $set.completedAt = null;
    $set.approvedAt = null;
    $set.approvedBy = null;
    $set.approvedByEmail = "";
  }

  // Optimistic concurrency: the update only applies if nobody else changed the event meanwhile.
  const after = await PartyEvent.findOneAndUpdate(
    { _id, revision: before.revision ?? 0 },
    { $set, $inc },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!after) throw conflict("This party was modified by someone else. Please reload and try again.");

  await audit({
    action: becameCompleted ? "event.approve" : leftCompleted ? "event.revert_completion" : "event.update",
    entityType: "PartyEvent",
    entityId: id,
    actorId,
    previousValue: before,
    newValue: after,
    reason: overridden ? `Budget override: ${budgetOverride?.reason ?? ""}` : "",
  });

  await applyStatusSideEffects(before, after, actorId);

  const detailsChanged = NOTIFY_FIELDS.some((f) => {
    if (rest[f] === undefined) return false;
    const a = before[f] instanceof Date ? (before[f] as Date).getTime() : before[f];
    const b = rest[f] instanceof Date ? (rest[f] as Date).getTime() : rest[f];
    return a !== b;
  });
  if (detailsChanged && after.status === "upcoming" && after.notificationPreferences?.updates) {
    // Debounce: one pending update email per event; it renders the latest state when sent.
    const pending = await ScheduledJob.exists({ eventId: _id, jobType: "event_update", status: "pending" });
    if (!pending) {
      await enqueueJob({
        jobType: "event_update",
        idempotencyKey: `event_update:${id}:r${after.revision}`,
        scheduledAt: new Date(Date.now() + EVENT_UPDATE_DEBOUNCE_MS),
        eventId: _id,
      });
    }
  }
  return after;
}

type EventLean = PartyEventDoc & { _id: Types.ObjectId };

async function applyStatusSideEffects(before: EventLean, after: EventLean, actorId: string) {
  if (before.status === after.status) return;
  if (after.status === "completed") {
    await onCompleted(after, actorId);
    return;
  }
  if (before.status === "completed") {
    // Reverted: cancel the pending thank-yous for the previous completion version.
    await cancelPendingJobs({ eventId: after._id, jobTypes: ["thank_you", "party_giver_thanks"] });
  }
  if (after.status === "cancelled") {
    await cancelPendingJobs({
      eventId: after._id,
      jobTypes: ["upcoming_reminder", "event_update", "instant_announcement", "party_day", "party_giver_notice", "party_approval_request"],
    });
    if (after.notificationPreferences?.updates) {
      await enqueueJob({
        jobType: "event_cancelled",
        idempotencyKey: `event_cancelled:${String(after._id)}:r${after.revision}`,
        scheduledAt: new Date(),
        eventId: after._id,
      });
    }
  }
}

async function onCompleted(event: EventLean, actorId: string) {
  await cancelPendingJobs({
    eventId: event._id,
    jobTypes: ["upcoming_reminder", "event_update", "party_day", "party_giver_notice", "party_approval_request"],
  });
  // Thanks from the team to the party giver, in the party-day confirmation thread.
  if (event.organizerEmail) {
    await enqueueJob({
      jobType: "party_giver_thanks",
      idempotencyKey: giverThanksKey(String(event._id), event.completionVersion),
      scheduledAt: new Date(),
      eventId: event._id,
      completionVersion: event.completionVersion,
    });
  }
  await enqueueJob({
    jobType: "thank_you",
    idempotencyKey: thankYouKey(String(event._id), event.completionVersion),
    scheduledAt: new Date((event.completedAt ?? new Date()).getTime() + env().THANK_YOU_DELAY_MS),
    eventId: event._id,
    completionVersion: event.completionVersion,
  });
  // Paying off the party debt: linked commitments graduate to Party Legends.
  const res = await PartyCommitment.updateMany(
    { relatedEventId: event._id, status: "pending" },
    { $set: { status: "completed", completedAt: event.completedAt ?? new Date() } }
  );
  if (res.modifiedCount) {
    await audit({
      action: "commitment.auto_complete",
      entityType: "PartyCommitment",
      entityId: String(event._id),
      actorId,
      newValue: { count: res.modifiedCount },
    });
  }
}

export async function setEventStatus(id: string, status: EventStatus, actorId: string) {
  return updateEvent(id, { status }, actorId);
}

/** Permanently deletes an event, its pending jobs, its bill records and the physical files. */
export async function deleteEvent(id: string, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id, "event id");
  const event = await PartyEvent.findById(_id).lean();
  if (!event) throw notFound("Party not found");
  await cancelPendingJobs({ eventId: _id });
  const bills = await PartyBill.find({ eventId: _id }).select("+storageKey").lean();
  await PartyEvent.deleteOne({ _id });
  await PartyBill.deleteMany({ eventId: _id });
  await PartyCommitment.updateMany({ relatedEventId: _id }, { $set: { relatedEventId: null } });
  // Physical cleanup after the records are gone; failures are logged, not fatal.
  for (const b of bills) {
    await deleteStoredFile(b.storageKey).catch((err) => console.error("[storage] delete failed", b.storageKey, err));
  }
  await deleteEventStorage(id).catch((err) => console.error("[storage] dir cleanup failed", id, err));
  await audit({ action: "event.delete", entityType: "PartyEvent", entityId: id, actorId, previousValue: event });
}

/** Public homepage data. */
export async function getHomepageEvents(now = new Date()) {
  await connectDB();
  const pub = { publicVisibility: true };
  const [nextUp, upcoming, instant, completed] = await Promise.all([
    PartyEvent.findOne({ ...pub, status: "upcoming", eventType: "scheduled", eventDate: { $gte: now } })
      .sort({ eventDate: 1 })
      .select({ "participants.email": 0, organizerEmail: 0 })
      .lean(),
    PartyEvent.find({ ...pub, status: "upcoming", eventType: "scheduled", eventDate: { $gte: now } })
      .sort({ eventDate: 1 })
      .limit(8)
      .select({ "participants.email": 0, organizerEmail: 0 })
      .lean(),
    PartyEvent.find({ ...pub, status: "upcoming", eventType: "instant" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ "participants.email": 0, organizerEmail: 0 })
      .lean(),
    PartyEvent.find({ ...pub, status: "completed" })
      .sort({ completedAt: -1, eventDate: -1 })
      .limit(6)
      .select({ "participants.email": 0, organizerEmail: 0 })
      .lean(),
  ]);
  return { nextUp, upcoming, instant, completed };
}
