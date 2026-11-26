import type { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { PartyEvent, PartyMoneyRole, PartyPayment, User, type PartyEventDoc, type PartyMoneyRoleDoc, type PartyPaymentDoc } from "@/models";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { assertObjectId } from "@/lib/utils-server";
import { atLocalHour, dayKey } from "@/lib/time";
import { upiPayLink } from "@/lib/contri";
import { fromPaise, personKey, remainingPaise, storedStatus, toPaise, viewStatus } from "@/lib/payments";
import type {
  MoneyRoleCreateSchema,
  MoneyRoleUpdateSchema,
  PaymentCreateSchema,
  PaymentRecordSchema,
  PaymentUpdateSchema,
  VoidTransactionSchema,
} from "@/lib/validation";
import { isPartyManager, PAYMENT_KIND_LABELS, type MoneyRole, type PaymentKind, type PaymentMethod, type PaymentModel, type PaymentViewStatus, type UserRole } from "@/types";
import { audit } from "./audit.service";

/**
 * Party payments: individual shares, lenders/providers, and the payments recorded against them.
 *
 * Rules enforced here (never trusted from the browser):
 * - every amount is integer paise, computed on the server;
 * - a payment can't exceed what is still due, so the due never goes negative;
 * - each "Mark as paid" carries an idempotency key and applies at most once;
 * - the same transaction reference can't be recorded twice on a party;
 * - a QR code is only a convenience: the status changes only when a payment is recorded.
 */

export type PaymentActor = { id: string; email: string; name: string; role: UserRole };

type EventLean = PartyEventDoc & { _id: Types.ObjectId };
type RoleLean = PartyMoneyRoleDoc & { _id: Types.ObjectId };
type PaymentLean = PartyPaymentDoc & { _id: Types.ObjectId };

const lower = (s?: string | null) => (s ?? "").trim().toLowerCase();
export const paymentModelOf = (e: { paymentModel?: string | null }): PaymentModel => (e.paymentModel === "lender_provider" ? "lender_provider" : "standard");

/* --------------------------------- access --------------------------------- */

/** Managers+ and the party giver manage a party's payments (any status: paying back happens after the party). */
export function canManagePayments(event: Pick<EventLean, "organizerEmail">, actor: PaymentActor) {
  return isPartyManager(actor.role) || (!!event.organizerEmail && lower(event.organizerEmail) === lower(actor.email));
}

type Access = { manage: boolean; collectorRoleIds: Set<string>; email: string };

function accessFor(event: EventLean, roles: RoleLean[], actor: PaymentActor): Access {
  const email = lower(actor.email);
  return {
    manage: canManagePayments(event, actor),
    // Providers (and lenders being repaid) may record money they received themselves.
    collectorRoleIds: new Set(roles.filter((r) => r.email && lower(r.email) === email).map((r) => String(r._id))),
    email,
  };
}

const canRecord = (a: Access, p: Pick<PaymentLean, "payeeRoleId">) => a.manage || (!!p.payeeRoleId && a.collectorRoleIds.has(String(p.payeeRoleId)));
const canView = (a: Access, p: Pick<PaymentLean, "payeeRoleId" | "payerEmail">) => canRecord(a, p) || (!!p.payerEmail && lower(p.payerEmail) === a.email);

async function loadEvent(eventId: string) {
  const _id = assertObjectId(eventId, "party id");
  const event = await PartyEvent.findById(_id).lean();
  if (!event) throw notFound("Party not found");
  return event as EventLean;
}

async function loadManaged(eventId: string, actor: PaymentActor) {
  const event = await loadEvent(eventId);
  if (!canManagePayments(event, actor)) throw forbidden("Only the party giver or a manager can manage this party's payments");
  return event;
}

const rolesOf = (eventId: Types.ObjectId) => PartyMoneyRole.find({ eventId }).sort({ role: 1, createdAt: 1 }).lean() as Promise<RoleLean[]>;

/* ------------------------------- view model ------------------------------- */

export type PayeeView = { roleId: string | null; role: MoneyRole | "host"; name: string; upiId: string };
export type TransactionView = {
  _id: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  paidAt: string;
  recordedByName: string;
  recordedByEmail: string;
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidedByEmail: string;
  voidReason: string;
};
export type PaymentView = {
  _id: string;
  eventId: string;
  kind: PaymentKind;
  payerName: string;
  payerEmail: string | null;
  payerRoleId: string | null;
  payee: PayeeView;
  total: number;
  paid: number;
  due: number;
  status: PaymentViewStatus;
  /** "yyyy-MM-dd" in the team's timezone. */
  dueDate: string | null;
  note: string;
  transactions: TransactionView[];
  /** upi:// link for exactly the outstanding amount; null when nothing is due or there's no UPI ID. */
  upiLink: string | null;
  /** Changes whenever the amounts do (cache-buster for the QR image). */
  revision: number;
  canRecord: boolean;
  isMine: boolean;
};
export type RoleView = { _id: string; role: MoneyRole; name: string; email: string | null; upiId: string; effectiveUpiId: string };
export type PaymentSummary = {
  budget: number | null;
  /** Individual shares. */
  assigned: number;
  collected: number;
  /** Lenders: promised / actually provided / still to provide. */
  lent: number;
  lentProvided: number;
  lentDue: number;
  /** Every record. */
  paid: number;
  outstanding: number;
  counts: Record<PaymentViewStatus | "all", number>;
};

/** UPI IDs from user profiles, for people without one on the party. */
async function profileUpiIds(emails: (string | null | undefined)[]) {
  const list = [...new Set(emails.filter((e): e is string => !!e).map(lower))];
  if (!list.length) return new Map<string, string>();
  const users = await User.find({ email: { $in: list } }).select({ email: 1, upiId: 1 }).lean();
  return new Map(users.map((u) => [u.email, (u.upiId ?? "").trim()]));
}

type Ctx = { event: EventLean; rolesById: Map<string, RoleLean>; upiByEmail: Map<string, string>; today: string };

async function buildCtx(event: EventLean, roles: RoleLean[]): Promise<Ctx> {
  return {
    event,
    rolesById: new Map(roles.map((r) => [String(r._id), r])),
    upiByEmail: await profileUpiIds([event.organizerEmail, ...roles.map((r) => r.email)]),
    today: dayKey(new Date()),
  };
}

function roleUpi(ctx: Ctx, r: RoleLean) {
  return (r.upiId || (r.email ? ctx.upiByEmail.get(lower(r.email)) : "") || "").trim();
}

function payeeOf(ctx: Ctx, p: Pick<PaymentLean, "payeeRoleId">): PayeeView {
  const r = p.payeeRoleId ? ctx.rolesById.get(String(p.payeeRoleId)) : undefined;
  if (r) return { roleId: String(r._id), role: r.role as MoneyRole, name: r.name, upiId: roleUpi(ctx, r) };
  const e = ctx.event;
  // The giver: the party's own contri UPI ID wins (same rule as the contri split), then their profile.
  const upiId = ((e.category === "contri" && e.contri?.upiId) || (e.organizerEmail ? ctx.upiByEmail.get(lower(e.organizerEmail)) : "") || "").trim();
  return { roleId: null, role: "host", name: e.organizerName, upiId };
}

function toView(ctx: Ctx, p: PaymentLean, access: Access): PaymentView {
  const duePaise = remainingPaise(p.amountPaise, p.paidPaise);
  const payee = payeeOf(ctx, p);
  const dueDay = p.dueDate ? dayKey(p.dueDate) : null;
  const ref = String(p._id).slice(-6);
  return {
    _id: String(p._id),
    eventId: String(p.eventId),
    kind: p.kind as PaymentKind,
    payerName: p.payerName,
    payerEmail: access.manage || canView(access, p) ? (p.payerEmail ?? null) : null,
    payerRoleId: p.payerRoleId ? String(p.payerRoleId) : null,
    payee,
    total: fromPaise(p.amountPaise),
    paid: fromPaise(p.paidPaise),
    due: fromPaise(duePaise),
    status: viewStatus(p.amountPaise, p.paidPaise, dueDay, ctx.today),
    dueDate: dueDay,
    note: p.note ?? "",
    transactions: (p.transactions ?? []).map((t) => {
      const tx = t as typeof t & { _id: Types.ObjectId; createdAt?: Date };
      return {
        _id: String(tx._id),
        amount: fromPaise(tx.amountPaise),
        method: tx.method as PaymentMethod,
        reference: tx.reference ?? "",
        note: tx.note ?? "",
        paidAt: new Date(tx.paidAt).toISOString(),
        recordedByName: tx.recordedByName ?? "",
        recordedByEmail: tx.recordedByEmail ?? "",
        createdAt: new Date(tx.createdAt ?? tx.paidAt).toISOString(),
        voided: !!tx.voidedAt,
        voidedAt: tx.voidedAt ? new Date(tx.voidedAt).toISOString() : null,
        voidedByEmail: tx.voidedByEmail ?? "",
        voidReason: tx.voidReason ?? "",
      };
    }),
    // Never a QR for a zero or fully paid amount.
    upiLink:
      duePaise > 0 && payee.upiId
        ? upiPayLink({ upiId: payee.upiId, payeeName: payee.name, amount: fromPaise(duePaise), note: `${PAYMENT_KIND_LABELS[p.kind as PaymentKind]}: ${ctx.event.title} #${ref}` })
        : null,
    revision: p.revision ?? 0,
    canRecord: canRecord(access, p),
    isMine: !!p.payerEmail && lower(p.payerEmail) === access.email,
  };
}

function summarize(event: EventLean, payments: PaymentLean[], views: PaymentView[]): PaymentSummary {
  let assigned = 0, collected = 0, lent = 0, lentProvided = 0, paid = 0, outstanding = 0;
  for (const p of payments) {
    paid += p.paidPaise;
    outstanding += remainingPaise(p.amountPaise, p.paidPaise);
    if (p.kind === "share") {
      assigned += p.amountPaise;
      collected += p.paidPaise;
    } else if (p.kind === "lend") {
      lent += p.amountPaise;
      lentProvided += p.paidPaise;
    }
  }
  const counts = { all: views.length, pending: 0, partially_paid: 0, paid: 0, overdue: 0 };
  for (const v of views) counts[v.status]++;
  return {
    budget: event.budget ?? null,
    assigned: fromPaise(assigned),
    collected: fromPaise(collected),
    lent: fromPaise(lent),
    lentProvided: fromPaise(lentProvided),
    lentDue: fromPaise(Math.max(0, lent - lentProvided)),
    paid: fromPaise(paid),
    outstanding: fromPaise(outstanding),
    counts,
  };
}

function roleView(ctx: Ctx, r: RoleLean): RoleView {
  return { _id: String(r._id), role: r.role as MoneyRole, name: r.name, email: r.email ?? null, upiId: r.upiId ?? "", effectiveUpiId: roleUpi(ctx, r) };
}

/* ---------------------------------- reads --------------------------------- */

/**
 * A party's payments as the viewer may see them: managers see everything; anyone else sees
 * only what they owe and what they collect. The summary covers the visible records.
 */
export async function getPartyPayments(eventId: string, actor: PaymentActor) {
  await connectDB();
  const event = await loadEvent(eventId);
  const roles = await rolesOf(event._id);
  const access = accessFor(event, roles, actor);
  const all = (await PartyPayment.find({ eventId: event._id }).sort({ kind: 1, createdAt: 1 }).lean()) as PaymentLean[];
  const visible = all.filter((p) => access.manage || canView(access, p));
  const ctx = await buildCtx(event, roles);
  const views = visible.map((p) => toView(ctx, p, access));
  return {
    eventId: String(event._id),
    title: event.title,
    paymentModel: paymentModelOf(event),
    canManage: access.manage,
    roles: access.manage ? roles.map((r) => roleView(ctx, r)) : [],
    payments: views,
    summary: summarize(event, visible, views),
  };
}

export type PartyPaymentsData = Awaited<ReturnType<typeof getPartyPayments>>;

/** "My payments": what the signed-in user owes, and what they collect as a provider/lender, across parties. */
export async function listMyPayments(actor: PaymentActor) {
  await connectDB();
  const email = lower(actor.email);
  const myRoles = (await PartyMoneyRole.find({ email }).lean()) as RoleLean[];
  const records = (await PartyPayment.find({
    $or: [{ payerEmail: email }, ...(myRoles.length ? [{ payeeRoleId: { $in: myRoles.map((r) => r._id) } }] : [])],
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean()) as PaymentLean[];
  const eventIds = [...new Set(records.map((r) => String(r.eventId)))].map((id) => new Types.ObjectId(id));
  const [events, roles] = await Promise.all([
    PartyEvent.find({ _id: { $in: eventIds } }).lean() as Promise<EventLean[]>,
    PartyMoneyRole.find({ eventId: { $in: eventIds } }).lean() as Promise<RoleLean[]>,
  ]);
  const groups = [];
  for (const event of events) {
    const eventRoles = roles.filter((r) => String(r.eventId) === String(event._id));
    const access = accessFor(event, eventRoles, actor);
    const ctx = await buildCtx(event, eventRoles);
    const views = records.filter((r) => String(r.eventId) === String(event._id) && canView(access, r)).map((r) => toView(ctx, r, access));
    if (views.length) groups.push({ eventId: String(event._id), title: event.title, eventDate: new Date(event.eventDate).toISOString(), canManage: access.manage, payments: views });
  }
  return groups.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

/** The upi:// link for a QR code, only for someone allowed to see that obligation. */
export async function getPaymentUpiLink(eventId: string, paymentId: string, actor: PaymentActor) {
  await connectDB();
  const event = await loadEvent(eventId);
  const p = (await PartyPayment.findOne({ _id: assertObjectId(paymentId, "payment id"), eventId: event._id }).lean()) as PaymentLean | null;
  if (!p) throw notFound("Payment not found");
  const roles = await rolesOf(event._id);
  const access = accessFor(event, roles, actor);
  if (!canView(access, p)) throw notFound("Payment not found");
  return toView(await buildCtx(event, roles), p, access).upiLink;
}

/* --------------------------------- helpers -------------------------------- */

const dueDateFrom = (v: string | null | undefined) => (v === undefined ? undefined : v ? atLocalHour(v, 12) : null);

async function assertPayee(event: EventLean, payeeRoleId: string | null | undefined, opts: { notRoleId?: string } = {}) {
  if (!payeeRoleId) return null;
  const _id = assertObjectId(payeeRoleId, "payee");
  const role = await PartyMoneyRole.findOne({ _id, eventId: event._id }).lean();
  if (!role) throw badRequest("The payee isn't a lender or provider on this party");
  if (opts.notRoleId && String(role._id) === opts.notRoleId) throw badRequest("A lender can't pay themselves");
  return _id;
}

function assertLenderModel(event: EventLean) {
  if (paymentModelOf(event) !== "lender_provider") throw badRequest("Switch this party to the “Lenders & providers” payment model first");
}

function rethrowDuplicate(err: unknown, message: string): never {
  if (typeof err === "object" && err && (err as { code?: number }).code === 11000) throw conflict(message);
  throw err;
}

async function loadPayment(event: EventLean, paymentId: string) {
  const p = (await PartyPayment.findOne({ _id: assertObjectId(paymentId, "payment id"), eventId: event._id }).lean()) as PaymentLean | null;
  if (!p) throw notFound("Payment not found");
  return p;
}

/* ---------------------------- lenders & providers ---------------------------- */

export async function createMoneyRole(eventId: string, input: z.infer<typeof MoneyRoleCreateSchema>, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  assertLenderModel(event);
  const _id = new Types.ObjectId();
  const payeeRoleId = input.role === "lender" ? await assertPayee(event, input.payeeRoleId) : null;
  let role;
  try {
    role = await PartyMoneyRole.create({
      _id,
      eventId: event._id,
      role: input.role,
      name: input.name,
      email: input.email ?? null,
      upiId: input.upiId ?? "",
      personKey: personKey({ name: input.name, email: input.email }),
    });
  } catch (err) {
    rethrowDuplicate(err, `${input.name} is already a ${input.role} on this party`);
  }
  if (input.role === "lender") {
    // What the lender provides is tracked like any other obligation (provided = paid).
    try {
      await PartyPayment.create({
        eventId: event._id,
        kind: "lend",
        payerName: input.name,
        payerEmail: input.email ?? null,
        payerRoleId: _id,
        payeeRoleId,
        amountPaise: toPaise(input.expectedAmount!),
        dueDate: dueDateFrom(input.dueDate) ?? null,
        dedupeKey: `lend:${String(_id)}`,
        createdById: Types.ObjectId.isValid(actor.id) ? actor.id : null,
      });
    } catch (err) {
      await PartyMoneyRole.deleteOne({ _id });
      throw err;
    }
  }
  await audit({ action: "payment_role.create", entityType: "PartyMoneyRole", entityId: String(_id), actorId: actor.id, newValue: { ...role.toObject(), expectedAmount: input.expectedAmount ?? null } });
  return role.toObject();
}

export async function updateMoneyRole(eventId: string, roleId: string, input: z.infer<typeof MoneyRoleUpdateSchema>, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const _id = assertObjectId(roleId, "role id");
  const before = await PartyMoneyRole.findOne({ _id, eventId: event._id }).lean();
  if (!before) throw notFound("Lender or provider not found");
  const name = input.name ?? before.name;
  const email = input.email !== undefined ? input.email : (before.email ?? null);
  const $set: Record<string, unknown> = { name, email, personKey: personKey({ name, email }) };
  if (input.upiId !== undefined) $set.upiId = input.upiId;
  let after;
  try {
    after = await PartyMoneyRole.findOneAndUpdate({ _id }, { $set }, { returnDocument: "after", runValidators: true }).lean();
  } catch (err) {
    rethrowDuplicate(err, `${name} is already a ${before.role} on this party`);
  }
  // The lender's own record follows their name/email (so they see it under My payments).
  await PartyPayment.updateMany({ eventId: event._id, payerRoleId: _id }, { $set: { payerName: name, payerEmail: email } });
  await audit({ action: "payment_role.update", entityType: "PartyMoneyRole", entityId: roleId, actorId: actor.id, previousValue: before, newValue: after });
  return after;
}

export async function deleteMoneyRole(eventId: string, roleId: string, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const _id = assertObjectId(roleId, "role id");
  const role = await PartyMoneyRole.findOne({ _id, eventId: event._id }).lean();
  if (!role) throw notFound("Lender or provider not found");
  if (await PartyPayment.exists({ eventId: event._id, payeeRoleId: _id })) {
    throw conflict(`Some payments go to ${role.name}. Point them to someone else first.`);
  }
  const own = await PartyPayment.findOne({ eventId: event._id, payerRoleId: _id }).lean();
  if (own && (own.paidPaise > 0 || (own.transactions ?? []).some((t) => !t.voidedAt))) {
    throw conflict(`${role.name} has already provided money. Void those payments before removing them.`);
  }
  await PartyPayment.deleteMany({ eventId: event._id, payerRoleId: _id });
  await PartyMoneyRole.deleteOne({ _id });
  await audit({ action: "payment_role.delete", entityType: "PartyMoneyRole", entityId: roleId, actorId: actor.id, previousValue: { role, lendRecord: own } });
}

/* ------------------------------- obligations ------------------------------ */

export async function createPayment(eventId: string, input: z.infer<typeof PaymentCreateSchema>, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const payeeRoleId = await assertPayee(event, input.payeeRoleId);
  if (payeeRoleId) assertLenderModel(event);
  try {
    const doc = await PartyPayment.create({
      eventId: event._id,
      kind: input.kind,
      payerName: input.payerName,
      payerEmail: input.payerEmail ?? null,
      payeeRoleId,
      amountPaise: toPaise(input.amount),
      dueDate: dueDateFrom(input.dueDate) ?? null,
      note: input.note,
      // One share per person per party; "other" records may repeat.
      dedupeKey: input.kind === "share" ? `share:${personKey({ name: input.payerName, email: input.payerEmail })}` : null,
      createdById: Types.ObjectId.isValid(actor.id) ? actor.id : null,
    });
    const created = doc.toObject();
    await audit({ action: "payment.create", entityType: "PartyPayment", entityId: String(doc._id), actorId: actor.id, newValue: created });
    return created;
  } catch (err) {
    rethrowDuplicate(err, `${input.payerName} already has a share on this party. Edit it instead.`);
  }
}

export async function updatePayment(eventId: string, paymentId: string, input: z.infer<typeof PaymentUpdateSchema>, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const before = await loadPayment(event, paymentId);
  const $set: Record<string, unknown> = {};
  const hasPayments = before.paidPaise > 0;

  if (input.payerName !== undefined || input.payerEmail !== undefined) {
    if (before.kind === "lend") throw badRequest("Change the lender's name on the lender instead");
    const name = input.payerName ?? before.payerName;
    const email = input.payerEmail !== undefined ? input.payerEmail : (before.payerEmail ?? null);
    if (hasPayments && personKey({ name, email }) !== personKey({ name: before.payerName, email: before.payerEmail })) {
      throw conflict("Payments were already recorded from this person, so it can't be reassigned");
    }
    Object.assign($set, { payerName: name, payerEmail: email });
    if (before.kind === "share") $set.dedupeKey = `share:${personKey({ name, email })}`;
  }
  if (input.payeeRoleId !== undefined) {
    const next = await assertPayee(event, input.payeeRoleId, { notRoleId: before.payerRoleId ? String(before.payerRoleId) : undefined });
    if (String(next ?? "") !== String(before.payeeRoleId ?? "")) {
      if (hasPayments) throw conflict("Money was already received for this payment, so the recipient can't change");
      if (next) assertLenderModel(event);
      $set.payeeRoleId = next;
    }
  }
  let amountPaise = before.amountPaise;
  if (input.amount !== undefined) {
    amountPaise = toPaise(input.amount);
    if (amountPaise < before.paidPaise) throw badRequest(`₹${fromPaise(before.paidPaise)} was already paid, so the amount can't be lower than that`);
    $set.amountPaise = amountPaise;
    $set.status = storedStatus(amountPaise, before.paidPaise);
  }
  const due = dueDateFrom(input.dueDate);
  if (due !== undefined) $set.dueDate = due;
  if (input.note !== undefined) $set.note = input.note;

  let after;
  try {
    after = await PartyPayment.findOneAndUpdate(
      { _id: before._id, revision: before.revision ?? 0 },
      { $set, $inc: { revision: 1 } },
      { returnDocument: "after", runValidators: true }
    ).lean();
  } catch (err) {
    rethrowDuplicate(err, "That person already has a share on this party");
  }
  if (!after) throw conflict("This payment was changed meanwhile. Reload and try again.");
  await audit({ action: "payment.update", entityType: "PartyPayment", entityId: paymentId, actorId: actor.id, previousValue: before, newValue: after });
  return after;
}

export async function deletePayment(eventId: string, paymentId: string, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const p = await loadPayment(event, paymentId);
  if (p.kind === "lend") throw badRequest("Remove the lender instead");
  // Every payment keeps its record: once money was recorded, it can only be voided.
  if ((p.transactions ?? []).some((t) => !t.voidedAt)) throw conflict("Payments were recorded against this. Void them first.");
  const res = await PartyPayment.deleteOne({ _id: p._id, revision: p.revision ?? 0 });
  if (!res.deletedCount) throw conflict("This payment was changed meanwhile. Reload and try again.");
  await audit({ action: "payment.delete", entityType: "PartyPayment", entityId: paymentId, actorId: actor.id, previousValue: p });
}

/* ------------------------------ mark as paid ------------------------------ */

/**
 * Records money received against an obligation (full or partial). Applied in one atomic update
 * guarded by the record's revision and the idempotency key, so a double click, a retry or two
 * people marking at once can never count the same money twice or overpay.
 */
export async function recordPayment(eventId: string, paymentId: string, input: z.infer<typeof PaymentRecordSchema>, actor: PaymentActor) {
  await connectDB();
  const event = await loadEvent(eventId);
  const roles = await rolesOf(event._id);
  const access = accessFor(event, roles, actor);
  const before = await loadPayment(event, paymentId);
  if (!canRecord(access, before)) throw forbidden("Only the party giver, a manager or the person collecting this payment can record it");

  const existing = (before.transactions ?? []).find((t) => t.idempotencyKey === input.idempotencyKey);
  if (existing) return { payment: before, duplicate: true };

  const due = remainingPaise(before.amountPaise, before.paidPaise);
  if (due <= 0) throw conflict("This is already fully paid");
  const amountPaise = input.amount !== undefined ? toPaise(input.amount) : due;
  if (amountPaise > due) throw badRequest(`Only ₹${fromPaise(due)} is still due. Record at most that.`);

  const paidAt = input.paidOn ? atLocalHour(input.paidOn, 12) : new Date();
  if (input.paidOn && input.paidOn > dayKey(new Date())) throw badRequest("The payment date can't be in the future");
  if (input.reference) {
    const dup = await PartyPayment.exists({ eventId: event._id, transactions: { $elemMatch: { reference: input.reference, voidedAt: null } } });
    if (dup) throw conflict(`Transaction reference ${input.reference} is already recorded on this party`);
  }

  const paidPaise = before.paidPaise + amountPaise;
  const tx = {
    _id: new Types.ObjectId(),
    amountPaise,
    method: input.method,
    reference: input.reference,
    note: input.note,
    paidAt,
    recordedById: Types.ObjectId.isValid(actor.id) ? actor.id : null,
    recordedByEmail: actor.email,
    recordedByName: actor.name,
    idempotencyKey: input.idempotencyKey,
  };
  const after = await PartyPayment.findOneAndUpdate(
    { _id: before._id, revision: before.revision ?? 0, paidPaise: before.paidPaise, "transactions.idempotencyKey": { $ne: input.idempotencyKey } },
    { $push: { transactions: tx }, $set: { paidPaise, status: storedStatus(before.amountPaise, paidPaise) }, $inc: { revision: 1 } },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!after) {
    // Lost a race: either the same submit landed first (fine) or someone else changed the amounts.
    const now = (await PartyPayment.findById(before._id).lean()) as PaymentLean | null;
    if (now?.transactions?.some((t) => t.idempotencyKey === input.idempotencyKey)) return { payment: now, duplicate: true };
    throw conflict("This payment was changed meanwhile. Reload and try again.");
  }
  await audit({
    action: "payment.record",
    entityType: "PartyPayment",
    entityId: paymentId,
    actorId: actor.id,
    previousValue: { paidPaise: before.paidPaise, status: before.status },
    newValue: { transaction: tx, paidPaise: after.paidPaise, status: after.status },
  });
  return { payment: after, duplicate: false };
}

/** Undoes a payment recorded by mistake. The transaction stays in the history, marked voided. */
export async function voidTransaction(eventId: string, paymentId: string, txId: string, input: z.infer<typeof VoidTransactionSchema>, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const before = await loadPayment(event, paymentId);
  const tId = assertObjectId(txId, "transaction id");
  const tx = (before.transactions ?? []).find((t) => String((t as { _id?: Types.ObjectId })._id) === String(tId));
  if (!tx) throw notFound("Transaction not found");
  if (tx.voidedAt) throw conflict("This payment was already voided");
  const paidPaise = Math.max(0, before.paidPaise - tx.amountPaise);
  const after = await PartyPayment.findOneAndUpdate(
    { _id: before._id, revision: before.revision ?? 0 },
    {
      $set: {
        "transactions.$[t].voidedAt": new Date(),
        "transactions.$[t].voidedByEmail": actor.email,
        "transactions.$[t].voidReason": input.reason,
        paidPaise,
        status: storedStatus(before.amountPaise, paidPaise),
      },
      $inc: { revision: 1 },
    },
    { arrayFilters: [{ "t._id": tId, "t.voidedAt": null }], returnDocument: "after", runValidators: true }
  ).lean();
  if (!after) throw conflict("This payment was changed meanwhile. Reload and try again.");
  await audit({ action: "payment.void", entityType: "PartyPayment", entityId: paymentId, actorId: actor.id, previousValue: { paidPaise: before.paidPaise, transaction: tx }, newValue: { paidPaise }, reason: input.reason });
  return after;
}

/* ------------------------------ party lifecycle ------------------------------ */

/** Lender/provider is a separate model from the contri split, so the two can't be combined. */
export async function assertPaymentModelChange(opts: { eventId?: Types.ObjectId; category: string; before?: PaymentModel; next: PaymentModel }) {
  if (opts.next === "lender_provider" && opts.category === "contri") {
    throw badRequest("Contri parties use the contri split. Pick another category for lenders & providers.");
  }
  if (opts.eventId && opts.before === "lender_provider" && opts.next !== "lender_provider") {
    await connectDB();
    if (await PartyMoneyRole.exists({ eventId: opts.eventId })) {
      throw conflict("Remove this party's lenders and providers before switching its payment model");
    }
  }
}

/** Called when a party is deleted. */
export async function deleteEventPayments(eventId: Types.ObjectId) {
  await PartyPayment.deleteMany({ eventId });
  await PartyMoneyRole.deleteMany({ eventId });
}
