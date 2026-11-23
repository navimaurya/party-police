import type { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { User, PartyBill, PartyCommitment, PartyEvent, ScheduledJob, type PartyEventDoc } from "@/models";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { assertObjectId, escapeRegex } from "@/lib/utils-server";
import { cancelPendingJobs, enqueueJob } from "@/lib/scheduler";
import { deleteEventStorage, deleteStoredFile } from "@/lib/storage";
import { env } from "@/config/env";
import { mongoSort, parseSort, TEXT_COLLATION } from "@/lib/sort";
import { EVENT_DEFAULT_SORT, EVENT_SORT_FIELDS } from "@/lib/sort-fields";
import type { CreateEventSchema, EventListQuerySchema, UpdateEventSchema } from "@/lib/validation";
import { atLocalHour, dayKey } from "@/lib/time";
import { computeContriSplit } from "@/lib/contri";
import { isAdminRole, isPartyManager, type EventStatus, type UserRole } from "@/types";
import { enforceBudget } from "./budget.service";
import { audit } from "./audit.service";
import { giverThanksKey } from "./notification.service";

/**
 * "Party added" and "party changed" emails wait this long, so edits made right after
 * (fixing a typo in the date, swapping the giver) end up in ONE email with the final state.
 */
export const EVENT_NOTIFY_DELAY_MS = 60 * 1000;
export const EVENT_UPDATE_DEBOUNCE_MS = EVENT_NOTIFY_DELAY_MS;

/** Parties are scheduled by day. A date-only party is stored at this local hour (APP_TIMEZONE). */
export const PARTY_DAY_HOUR = 12;

/** "yyyy-MM-dd" -> that day at PARTY_DAY_HOUR in APP_TIMEZONE. Full timestamps are kept as given. */
export function resolveEventDate(v: string | Date | undefined): Date | undefined {
  if (v === undefined) return undefined;
  return typeof v === "string" ? atLocalHour(v, PARTY_DAY_HOUR) : v;
}

/** The signed-in user creating or editing a party. Omitted for system/internal calls. */
export type EventActor = { id: string; email: string; name: string; role: UserRole };

export const eventScheduledKey = (eventId: string) => `event_scheduled:${eventId}`;

type CreateInput = z.infer<typeof CreateEventSchema>;
type UpdateInput = z.infer<typeof UpdateEventSchema>;
type ListQuery = z.infer<typeof EventListQuerySchema>;

const DEFAULT_PREFS = { reminders: true, announcement: true, updates: true, thankYou: true, includeBillLinks: true };

export function thankYouKey(eventId: string, version: number) {
  return `thank_you:${eventId}:v${version}`;
}

export async function listEvents(query: ListQuery, opts: { admin: boolean; organizerEmail?: string }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (!opts.admin) filter.publicVisibility = true;
  // "My parties": only the ones this person is giving.
  if (opts.organizerEmail) filter.organizerEmail = opts.organizerEmail.toLowerCase();
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

export async function getCalendarEvents(from: Date, to: Date, opts: { admin: boolean; viewerEmail?: string }) {
  await connectDB();
  if (to <= from) throw badRequest("`to` must be after `from`");
  if (to.getTime() - from.getTime() > 100 * 24 * 3600 * 1000) throw badRequest("Range too large (max 100 days)");
  const filter: Record<string, unknown> = { eventDate: { $gte: from, $lte: to } };
  // Signed-in members also see their own private parties.
  if (!opts.admin) {
    filter.$or = opts.viewerEmail ? [{ publicVisibility: true }, { organizerEmail: opts.viewerEmail.toLowerCase() }] : [{ publicVisibility: true }];
  }
  return PartyEvent.find(filter)
    .sort({ eventDate: 1 })
    .limit(500)
    .select({ title: 1, eventType: 1, category: 1, organizerName: 1, eventDate: 1, status: 1, location: 1, occasion: 1 })
    .lean();
}

/**
 * Who may add what:
 * - members add only parties THEY are giving, and can't mark them approved;
 * - managers add parties for anyone, but approving stays with admins;
 * - budget overrides are for admins.
 */
function assertCanCreate(data: Omit<CreateInput, "budgetOverride">, hasOverride: boolean, actor: EventActor) {
  if (!isPartyManager(actor.role)) {
    const own = actor.email.toLowerCase();
    if (data.organizerEmail && data.organizerEmail !== own) throw forbidden("You can only add parties you are giving");
    data.organizerEmail = own;
    data.organizerName = data.organizerName || actor.name;
  }
  if (data.status === "completed" && !isAdminRole(actor.role)) throw forbidden("Only an admin can approve a party");
  if (hasOverride && !isAdminRole(actor.role)) throw forbidden("Only an admin can override the budget");
}

export async function createEvent(input: CreateInput, actorId: string, actor?: EventActor) {
  await connectDB();
  const { budgetOverride, eventDate: rawDate, ...data } = input;
  if (actor) assertCanCreate(data, !!budgetOverride, actor);
  const eventDate = resolveEventDate(rawDate) ?? new Date();
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
  // Scheduled party: tell its participants a minute from now. Edits made within that minute
  // don't send their own email; this one renders the latest state when it goes out.
  if (event.eventType === "scheduled" && event.status === "upcoming" && event.notificationPreferences?.announcement) {
    await enqueueJob({
      jobType: "event_scheduled",
      idempotencyKey: eventScheduledKey(String(_id)),
      scheduledAt: new Date(now.getTime() + EVENT_NOTIFY_DELAY_MS),
      eventId: _id,
    });
  }
  if (isCompleted) await onCompleted(event, actorId);
  return event;
}

/** Members edit only their own, not-yet-approved parties; approving / un-approving is for admins. */
function assertCanEdit(before: EventLean, rest: Omit<UpdateInput, "budgetOverride" | "notificationPreferences">, hasOverride: boolean, actor: EventActor) {
  const admin = isAdminRole(actor.role);
  if (!isPartyManager(actor.role)) {
    const own = actor.email.toLowerCase();
    if ((before.organizerEmail ?? "").toLowerCase() !== own) throw forbidden("You can only change parties you are giving");
    if (before.status === "completed") throw forbidden("This party is already approved");
    if (rest.organizerEmail !== undefined && rest.organizerEmail !== own) throw forbidden("You can't hand your party to someone else");
  }
  const nextStatus = rest.status ?? before.status;
  if (!admin && nextStatus !== before.status && (nextStatus === "completed" || before.status === "completed")) {
    throw forbidden("Only an admin can approve a party or undo an approval");
  }
  if (hasOverride && !admin) throw forbidden("Only an admin can override the budget");
}

export async function updateEvent(id: string, input: UpdateInput, actorId: string, actor?: EventActor) {
  await connectDB();
  const _id = assertObjectId(id, "event id");
  const before = await PartyEvent.findById(_id).lean();
  if (!before) throw notFound("Party not found");
  const { budgetOverride, notificationPreferences, eventDate: rawDate, ...rest } = input;
  if (actor) assertCanEdit(before, rest, !!budgetOverride, actor);
  const nextDate = resolveEventDate(rawDate);

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

  const { contri, ...plain } = rest;
  const $set: Record<string, unknown> = Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== undefined));
  if (nextDate) $set.eventDate = nextDate;
  // Partial update of the contri split, so sending one field doesn't wipe the others.
  if (contri) {
    for (const [k, v] of Object.entries(contri)) if (v !== undefined) $set[`contri.${k}`] = v;
  }
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

  // Participants hear about a change only when the party DAY or the party GIVER changed.
  const dateChanged = !!nextDate && dayKey(nextDate) !== dayKey(before.eventDate);
  const giverChanged =
    (rest.organizerEmail !== undefined && (rest.organizerEmail ?? "") !== (before.organizerEmail ?? "")) ||
    (rest.organizerName !== undefined && rest.organizerName !== before.organizerName);
  if ((dateChanged || giverChanged) && after.status === "upcoming" && after.notificationPreferences?.updates) {
    // Debounce: while the "party added" email or an update email is still waiting, it will
    // render the latest state, so no second email is queued for the same party.
    const pending = await ScheduledJob.exists({
      eventId: _id,
      jobType: { $in: ["event_scheduled", "instant_announcement", "event_update"] },
      status: "pending",
    });
    if (!pending) {
      await enqueueJob({
        jobType: "event_update",
        idempotencyKey: `event_update:${id}:r${after.revision}`,
        scheduledAt: new Date(Date.now() + EVENT_UPDATE_DEBOUNCE_MS),
        eventId: _id,
        // What participants were last told; if a later edit undoes the change, nothing is sent.
        payload: {
          previousDay: dayKey(before.eventDate),
          previousDate: new Date(before.eventDate).toISOString(),
          previousGiver: before.organizerName,
          previousGiverEmail: before.organizerEmail ?? "",
        },
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
    // Cancelled before anyone was told about it: don't announce the cancellation either.
    const unannounced = await ScheduledJob.exists({ eventId: after._id, jobType: "event_scheduled", status: "pending" });
    await cancelPendingJobs({
      eventId: after._id,
      jobTypes: ["upcoming_reminder", "event_update", "event_scheduled", "instant_announcement", "party_day", "party_giver_notice", "party_approval_request"],
    });
    if (after.notificationPreferences?.updates && !unannounced) {
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
    jobTypes: ["upcoming_reminder", "event_update", "event_scheduled", "party_day", "party_giver_notice", "party_approval_request"],
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

export async function setEventStatus(id: string, status: EventStatus, actorId: string, actor?: EventActor) {
  return updateEvent(id, { status }, actorId, actor);
}

/**
 * Contri split for a party page. Computed from the full record (participant emails, host email)
 * so public pages get the same numbers without exposing those emails.
 */
export async function getEventContriSplit(id: string, opts: { admin: boolean }) {
  await connectDB();
  const _id = assertObjectId(id, "event id");
  const event = await PartyEvent.findOne(opts.admin ? { _id } : { _id, publicVisibility: true }).lean();
  if (!event || event.category !== "contri" || event.status === "cancelled") return null;
  const host = event.organizerEmail ? await User.findOne({ email: event.organizerEmail }).select({ upiId: 1 }).lean() : null;
  return computeContriSplit(event, host?.upiId);
}

export const APPROVAL_REQUEST_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The party giver (or a manager) says the party was given: the Super Admin gets the
 * approval request right away (in the party-day thread when there is one).
 */
export async function requestApproval(id: string, actor: EventActor) {
  await connectDB();
  const _id = assertObjectId(id, "event id");
  const event = await PartyEvent.findById(_id).lean();
  if (!event) throw notFound("Party not found");
  if (!isPartyManager(actor.role) && (event.organizerEmail ?? "").toLowerCase() !== actor.email.toLowerCase()) {
    throw forbidden("Only the party giver can ask for approval");
  }
  if (event.status !== "upcoming") throw badRequest(`This party is already ${event.status}`);
  const day = dayKey(event.eventDate);
  if (day > dayKey(new Date())) throw badRequest("You can ask for approval once the party has been given (on or after the party day)");
  if (event.approvalRequestedAt && Date.now() - new Date(event.approvalRequestedAt).getTime() < APPROVAL_REQUEST_COOLDOWN_MS) {
    throw conflict("Approval was already requested. The Super Admin has been notified.");
  }
  const now = new Date();
  await PartyEvent.updateOne({ _id }, { $set: { approvalRequestedAt: now, approvalRequestedByEmail: actor.email } });
  await enqueueJob({
    jobType: "party_approval_request",
    idempotencyKey: `party_approval_request:${id}:requested:${now.getTime()}`,
    scheduledAt: now,
    eventId: _id,
    payload: { dayKey: day, requested: true, requestedBy: actor.name },
  });
  await audit({ action: "event.approval_request", entityType: "PartyEvent", entityId: id, actorId: actor.id });
  return { requestedAt: now };
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
