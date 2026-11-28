import type { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { PartyEvent, PartyMoneyRole, PartyPayment, User, type PartyEventDoc, type PartyMoneyRoleDoc, type PartyPaymentDoc } from "@/models";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { assertObjectId } from "@/lib/utils-server";
import { atLocalHour, dayKey } from "@/lib/time";
import { computeContriSplit, upiPayLink } from "@/lib/contri";
import { fromPaise, personKey, remainingPaise, storedStatus, toPaise, viewStatus } from "@/lib/payments";
import type {
  MoneyRoleCreateSchema,
  MoneyRoleUpdateSchema,
  PaymentCreateSchema,
  PaymentRecordSchema,
  PaymentReviewSchema,
  PaymentStatusSchema,
  PaymentUpdateSchema,
  VoidTransactionSchema,
} from "@/lib/validation";
import { isAdminRole, isPartyManager, PAYMENT_KIND_LABELS, type MoneyRole, type PaymentKind, type PaymentMethod, type PaymentModel, type PaymentViewStatus, type UserRole } from "@/types";
import { audit } from "./audit.service";
import { enqueueJob } from "@/lib/scheduler";

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

type Access = { manage: boolean; admin: boolean; isGiver: boolean; collectorRoleIds: Set<string>; email: string };

function accessFor(event: EventLean, roles: RoleLean[], actor: PaymentActor): Access {
  const email = lower(actor.email);
  return {
    manage: canManagePayments(event, actor),
    admin: isAdminRole(actor.role),
    isGiver: !!event.organizerEmail && lower(event.organizerEmail) === email,
    // Money givers and providers confirm the money they received themselves.
    collectorRoleIds: new Set(roles.filter((r) => r.email && lower(r.email) === email).map((r) => String(r._id))),
    email,
  };
}

type Who = Pick<PaymentLean, "payeeRoleId" | "payerEmail">;
const isPayer = (a: Access, p: Pick<PaymentLean, "payerEmail">) => !!p.payerEmail && lower(p.payerEmail) === a.email;
/** The person the money goes to: the money giver / provider, or the party giver (payee = host). */
const isReceiverPerson = (a: Access, p: Pick<PaymentLean, "payeeRoleId">) => (p.payeeRoleId ? a.collectorRoleIds.has(String(p.payeeRoleId)) : a.isGiver);
/**
 * Who CONFIRMS money: whoever received it, or an admin. Never the payer: someone who paid
 * (e.g. the party giver repaying a money giver) can only ask for approval.
 * Confirming covers "Mark paid", approving requests, voiding and changing the status.
 */
const canConfirm = (a: Access, p: Who) => !isPayer(a, p) && (a.admin || isReceiverPerson(a, p));
/** The payer reports "I've paid": a request that counts only once it's approved. */
const canRequest = (a: Access, p: Who) => isPayer(a, p) && !canConfirm(a, p);
const canRecord = (a: Access, p: Who) => canConfirm(a, p) || canRequest(a, p);
const canView = (a: Access, p: Who) => a.manage || a.admin || isPayer(a, p) || isReceiverPerson(a, p);

type Tx = NonNullable<PaymentLean["transactions"]>[number] & { _id: Types.ObjectId; approval?: string | null };
const approvalOf = (t: Tx) => (t.approval ?? "confirmed") as "confirmed" | "pending" | "rejected";
/** Reported by the payer, not yet approved or rejected. */
const pendingPaise = (p: PaymentLean) => ((p.transactions ?? []) as Tx[]).filter((t) => approvalOf(t) === "pending").reduce((s, t) => s + t.amountPaise, 0);

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
  /** Marked by the payer themselves rather than by whoever received it. */
  selfReported: boolean;
  approval: "confirmed" | "pending" | "rejected";
  reviewedByName: string;
  reviewedAt: string | null;
  reviewNote: string;
  adjustment: boolean;
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
  /** Reported by the payer and waiting for approval (not counted in `paid` yet). */
  awaitingApproval: number;
  /** What the payer can still report: due minus what's already waiting for approval. */
  requestable: number;
  canRecord: boolean;
  /** Receiver or admin: Mark paid, approve/reject requests, void, change status. */
  canConfirm: boolean;
  /** The payer: "I've paid" sends a request for approval. */
  canRequest: boolean;
  isMine: boolean;
  /** Created from the contri split; follows it until edited by hand. */
  auto: boolean;
};
export type RoleView = { _id: string; role: MoneyRole; name: string; email: string | null; upiId: string; effectiveUpiId: string };
export type PaymentSummary = {
  budget: number | null;
  /** Individual shares. */
  assigned: number;
  collected: number;
  /** Borrowed from money givers / repaid to them / still owed to them. */
  lent: number;
  lentRepaid: number;
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
  const waiting = Math.min(duePaise, pendingPaise(p));
  // The QR is for what's left after the payments already reported, so nobody pays twice.
  const qrPaise = duePaise - waiting;
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
      const tx = t as Tx & { createdAt?: Date; reviewedAt?: Date | null; reviewedByName?: string; reviewNote?: string; adjustment?: boolean };
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
        selfReported: !!(tx as { selfReported?: boolean }).selfReported,
        approval: approvalOf(tx),
        reviewedByName: tx.reviewedByName ?? "",
        reviewedAt: tx.reviewedAt ? new Date(tx.reviewedAt).toISOString() : null,
        reviewNote: tx.reviewNote ?? "",
        adjustment: !!tx.adjustment,
        voided: !!tx.voidedAt,
        voidedAt: tx.voidedAt ? new Date(tx.voidedAt).toISOString() : null,
        voidedByEmail: tx.voidedByEmail ?? "",
        voidReason: tx.voidReason ?? "",
      };
    }),
    // Never a QR for a zero or fully paid amount.
    upiLink:
      qrPaise > 0 && payee.upiId
        ? upiPayLink({ upiId: payee.upiId, payeeName: payee.name, amount: fromPaise(qrPaise), note: `${PAYMENT_KIND_LABELS[p.kind as PaymentKind]}: ${ctx.event.title} #${ref}` })
        : null,
    revision: p.revision ?? 0,
    awaitingApproval: fromPaise(waiting),
    requestable: fromPaise(qrPaise),
    canRecord: canRecord(access, p),
    canConfirm: canConfirm(access, p),
    canRequest: canRequest(access, p),
    isMine: isPayer(access, p),
    auto: p.source === "contri",
  };
}

function summarize(event: EventLean, payments: PaymentLean[], views: PaymentView[]): PaymentSummary {
  let assigned = 0, collected = 0, lent = 0, lentRepaid = 0, paid = 0, outstanding = 0;
  for (const p of payments) {
    paid += p.paidPaise;
    outstanding += remainingPaise(p.amountPaise, p.paidPaise);
    if (p.kind === "share") {
      assigned += p.amountPaise;
      collected += p.paidPaise;
    } else if (p.kind === "lend") {
      lent += p.amountPaise;
      lentRepaid += p.paidPaise;
    }
  }
  const counts = { all: views.length, pending: 0, partially_paid: 0, paid: 0, overdue: 0 };
  for (const v of views) counts[v.status]++;
  return {
    budget: event.budget ?? null,
    assigned: fromPaise(assigned),
    collected: fromPaise(collected),
    lent: fromPaise(lent),
    lentRepaid: fromPaise(lentRepaid),
    lentDue: fromPaise(Math.max(0, lent - lentRepaid)),
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
  if (event.category === "contri") await syncContriShares(event._id);
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
  // Parties I give: payments to me (payee = host).
  const giving = await PartyEvent.find({ organizerEmail: email }).select({ _id: 1 }).lean();
  const filter: Record<string, unknown> = {
    $or: [
      { payerEmail: email },
      ...(myRoles.length ? [{ payeeRoleId: { $in: myRoles.map((r) => r._id) } }] : []),
      ...(giving.length ? [{ eventId: { $in: giving.map((e) => e._id) }, payeeRoleId: null }] : []),
      // Admins approve requests on any party.
      ...(isAdminRole(actor.role) ? [{ "transactions.approval": "pending" }] : []),
    ],
  };
  const records = (await PartyPayment.find(filter)
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

async function assertPayee(event: EventLean, payeeRoleId: string | null | undefined) {
  if (!payeeRoleId) return null;
  const _id = assertObjectId(payeeRoleId, "payee");
  const role = await PartyMoneyRole.findOne({ _id, eventId: event._id }).lean();
  if (!role) throw badRequest("The payee isn't a lender or provider on this party");
  return _id;
}

function assertLenderModel(event: EventLean) {
  if (paymentModelOf(event) !== "lender_provider") throw badRequest("Switch this party to the “Money givers & providers” payment model first");
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
    // The party giver borrowed this money: they owe it back to the money giver.
    try {
      await PartyPayment.create({
        eventId: event._id,
        kind: "lend",
        payerName: event.organizerName,
        payerEmail: event.organizerEmail ?? null,
        payeeRoleId: _id,
        amountPaise: toPaise(input.lentAmount!),
        dueDate: dueDateFrom(input.dueDate) ?? null,
        dedupeKey: `lend:${String(_id)}`,
        createdById: Types.ObjectId.isValid(actor.id) ? actor.id : null,
      });
    } catch (err) {
      await PartyMoneyRole.deleteOne({ _id });
      throw err;
    }
  }
  await audit({ action: "payment_role.create", entityType: "PartyMoneyRole", entityId: String(_id), actorId: actor.id, newValue: { ...role.toObject(), lentAmount: input.lentAmount ?? null } });
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
  await audit({ action: "payment_role.update", entityType: "PartyMoneyRole", entityId: roleId, actorId: actor.id, previousValue: before, newValue: after });
  return after;
}

export async function deleteMoneyRole(eventId: string, roleId: string, actor: PaymentActor) {
  await connectDB();
  const event = await loadManaged(eventId, actor);
  const _id = assertObjectId(roleId, "role id");
  const role = await PartyMoneyRole.findOne({ _id, eventId: event._id }).lean();
  if (!role) throw notFound("Lender or provider not found");
  if (await PartyPayment.exists({ eventId: event._id, payeeRoleId: _id, kind: { $ne: "lend" } })) {
    throw conflict(`Some payments go to ${role.name}. Point them to someone else first.`);
  }
  const own = await PartyPayment.findOne({ eventId: event._id, kind: "lend", payeeRoleId: _id }).lean();
  if (own && (own.paidPaise > 0 || (own.transactions ?? []).some((t) => !t.voidedAt))) {
    throw conflict(`Repayments to ${role.name} were already recorded. Void them before removing ${role.name}.`);
  }
  await PartyPayment.deleteMany({ eventId: event._id, kind: "lend", payeeRoleId: _id });
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
    if (before.kind === "lend") throw badRequest("Borrowed money is always repaid by the party giver");
    const name = input.payerName ?? before.payerName;
    const email = input.payerEmail !== undefined ? input.payerEmail : (before.payerEmail ?? null);
    if (hasPayments && personKey({ name, email }) !== personKey({ name: before.payerName, email: before.payerEmail })) {
      throw conflict("Payments were already recorded from this person, so it can't be reassigned");
    }
    Object.assign($set, { payerName: name, payerEmail: email });
    if (before.kind === "share") $set.dedupeKey = `share:${personKey({ name, email })}`;
  }
  if (input.payeeRoleId !== undefined) {
    const next = await assertPayee(event, input.payeeRoleId);
    if (before.kind === "lend" && String(next ?? "") !== String(before.payeeRoleId ?? "")) throw badRequest("Borrowed money is repaid to the money giver it came from");
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
  // Changed by hand: the contri split stops overwriting it.
  if (before.source === "contri" && (input.amount !== undefined || $set.payeeRoleId !== undefined)) $set.source = "manual";

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
  if (p.kind === "lend") throw badRequest("Remove the money giver instead");
  if (p.source === "contri") throw badRequest("This share comes from the contri split. Remove the person from the participants instead.");
  // Every payment keeps its record: once money was recorded, it can only be voided.
  if (((p.transactions ?? []) as Tx[]).some((t) => !t.voidedAt && approvalOf(t) !== "rejected")) throw conflict("Payments were recorded against this. Void or reject them first.");
  const res = await PartyPayment.deleteOne({ _id: p._id, revision: p.revision ?? 0 });
  if (!res.deletedCount) throw conflict("This payment was changed meanwhile. Reload and try again.");
  await audit({ action: "payment.delete", entityType: "PartyPayment", entityId: paymentId, actorId: actor.id, previousValue: p });
}

/* ------------------------------ mark as paid ------------------------------ */

const txId = () => new Types.ObjectId();

async function loadForMoney(eventId: string, paymentId: string, actor: PaymentActor) {
  const event = await loadEvent(eventId);
  const roles = await rolesOf(event._id);
  const access = accessFor(event, roles, actor);
  const before = await loadPayment(event, paymentId);
  return { event, roles, access, before };
}

const findTx = (p: PaymentLean, id: string) => ((p.transactions ?? []) as Tx[]).find((t) => String(t._id) === id);

/**
 * Records money against an obligation (full or partial).
 * - Whoever received it (or an admin) confirms it: it counts right away.
 * - The payer can only report it ("I've paid"): it waits for approval and counts once approved;
 *   the receiver and the admins are emailed.
 * Applied atomically, guarded by the record's revision and the idempotency key, so a double click,
 * a retry or two people at once never count the same money twice or overpay.
 */
export async function recordPayment(eventId: string, paymentId: string, input: z.infer<typeof PaymentRecordSchema>, actor: PaymentActor) {
  await connectDB();
  const { event, access, before } = await loadForMoney(eventId, paymentId, actor);
  const confirm = canConfirm(access, before);
  if (!confirm && !canRequest(access, before)) throw forbidden("Only the person who received this money or an admin can confirm it; the payer can ask them to approve it");

  const existing = (before.transactions ?? []).find((t) => t.idempotencyKey === input.idempotencyKey);
  if (existing) return { payment: before, duplicate: true };

  const due = remainingPaise(before.amountPaise, before.paidPaise);
  if (due <= 0) throw conflict("This is already fully paid");
  // A request can't go beyond what isn't already waiting for approval.
  const room = confirm ? due : due - pendingPaise(before);
  if (room <= 0) throw conflict("Your payment is already waiting for approval");
  const amountPaise = input.amount !== undefined ? toPaise(input.amount) : room;
  if (amountPaise > room) throw badRequest(confirm ? `Only ₹${fromPaise(due)} is still due. Record at most that.` : `Only ₹${fromPaise(room)} can be reported: the rest is already waiting for approval.`);

  const paidAt = input.paidOn ? atLocalHour(input.paidOn, 12) : new Date();
  if (input.paidOn && input.paidOn > dayKey(new Date())) throw badRequest("The payment date can't be in the future");
  if (input.reference) {
    const dup = await PartyPayment.exists({ eventId: event._id, transactions: { $elemMatch: { reference: input.reference, voidedAt: null, approval: { $ne: "rejected" } } } });
    if (dup) throw conflict(`Transaction reference ${input.reference} is already recorded on this party`);
  }

  const tx = {
    _id: txId(),
    amountPaise,
    method: input.method,
    reference: input.reference,
    note: input.note,
    paidAt,
    recordedById: Types.ObjectId.isValid(actor.id) ? actor.id : null,
    recordedByEmail: actor.email,
    recordedByName: actor.name,
    idempotencyKey: input.idempotencyKey,
    selfReported: !confirm,
    approval: confirm ? "confirmed" : "pending",
  };
  const paidPaise = confirm ? before.paidPaise + amountPaise : before.paidPaise;
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
  if (!confirm) {
    await enqueueJob({
      jobType: "payment_approval_request",
      idempotencyKey: `payment_approval_request:${String(tx._id)}`,
      scheduledAt: new Date(),
      eventId: event._id,
      payload: { paymentId: String(before._id), txId: String(tx._id) },
    });
  }
  await audit({
    action: confirm ? "payment.record" : "payment.request_approval",
    entityType: "PartyPayment",
    entityId: paymentId,
    actorId: actor.id,
    previousValue: { paidPaise: before.paidPaise, status: before.status },
    newValue: { transaction: tx, paidPaise: after.paidPaise, status: after.status },
  });
  return { payment: after, duplicate: false, awaitingApproval: !confirm };
}

/**
 * Approve or reject a payment the payer reported (receiver or admin, never the payer), or
 * withdraw it (the payer). Approving counts it, but never beyond what's still due.
 */
export async function reviewPayment(eventId: string, paymentId: string, transactionId: string, input: z.infer<typeof PaymentReviewSchema>, actor: PaymentActor) {
  await connectDB();
  const { access, before } = await loadForMoney(eventId, paymentId, actor);
  const tx = findTx(before, String(assertObjectId(transactionId, "transaction id")));
  if (!tx) throw notFound("Transaction not found");
  if (approvalOf(tx) !== "pending") throw conflict(`This payment was already ${approvalOf(tx) === "confirmed" ? "approved" : "rejected"}`);
  if (input.decision === "withdraw" ? !isPayer(access, before) : !canConfirm(access, before)) {
    throw forbidden(input.decision === "withdraw" ? "Only the payer can withdraw their request" : "Only the person who received this money or an admin can approve it");
  }

  const approve = input.decision === "approve";
  const due = remainingPaise(before.amountPaise, before.paidPaise);
  if (approve && tx.amountPaise > due) throw conflict(`Only ₹${fromPaise(due)} is still due now. Reject this one and ask for a new request.`);
  const paidPaise = approve ? before.paidPaise + tx.amountPaise : before.paidPaise;
  const after = await PartyPayment.findOneAndUpdate(
    { _id: before._id, revision: before.revision ?? 0 },
    {
      $set: {
        "transactions.$[t].approval": approve ? "confirmed" : "rejected",
        "transactions.$[t].reviewedAt": new Date(),
        "transactions.$[t].reviewedByEmail": actor.email,
        "transactions.$[t].reviewedByName": actor.name,
        "transactions.$[t].reviewNote": input.decision === "withdraw" ? input.note || "Withdrawn by the payer" : input.note,
        paidPaise,
        status: storedStatus(before.amountPaise, paidPaise),
      },
      $inc: { revision: 1 },
    },
    { arrayFilters: [{ "t._id": tx._id, "t.approval": "pending" }], returnDocument: "after", runValidators: true }
  ).lean();
  if (!after) throw conflict("This payment was changed meanwhile. Reload and try again.");
  await audit({ action: `payment.${input.decision}`, entityType: "PartyPayment", entityId: paymentId, actorId: actor.id, previousValue: { paidPaise: before.paidPaise, transaction: tx }, newValue: { paidPaise }, reason: input.note });
  return after;
}

/** Undoes a confirmed payment recorded by mistake. The transaction stays in the history, marked voided. */
export async function voidTransaction(eventId: string, paymentId: string, transactionId: string, input: z.infer<typeof VoidTransactionSchema>, actor: PaymentActor) {
  await connectDB();
  const { access, before } = await loadForMoney(eventId, paymentId, actor);
  if (!canConfirm(access, before)) throw forbidden("Only the person who received this money or an admin can void a payment");
  const tId = assertObjectId(transactionId, "transaction id");
  const tx = findTx(before, String(tId));
  if (!tx) throw notFound("Transaction not found");
  if (tx.voidedAt) throw conflict("This payment was already voided");
  if (approvalOf(tx) !== "confirmed") throw badRequest("Only approved payments can be voided. Reject a pending one instead.");
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

/**
 * "Change status" (receiver or admin, never the payer). Every change stays in the history:
 * - paid:           an adjustment for whatever is still due;
 * - pending:        every approved payment is voided;
 * - partially_paid: the paid total becomes `paidAmount` (adjustment up, or void + adjustment down).
 * Requests still waiting for approval are closed, since the status now says what was paid.
 */
export async function setPaymentStatus(eventId: string, paymentId: string, input: z.infer<typeof PaymentStatusSchema>, actor: PaymentActor) {
  await connectDB();
  const { access, before } = await loadForMoney(eventId, paymentId, actor);
  if (!canConfirm(access, before)) throw forbidden("Only the person who received this money or an admin can change its status");

  const total = before.amountPaise;
  const target = input.status === "paid" ? total : input.status === "pending" ? 0 : toPaise(input.paidAmount!);
  if (input.status === "partially_paid" && (target <= 0 || target >= total)) throw badRequest(`A partial payment is more than ₹0 and less than ₹${fromPaise(total)}`);
  if (target === before.paidPaise && storedStatus(total, target) === before.status && pendingPaise(before) === 0) throw conflict(`It's already ${input.status.replace("_", " ")}`);

  const now = new Date();
  const who = { reviewedAt: now, reviewedByEmail: actor.email, reviewedByName: actor.name };
  let txs = ((before.transactions ?? []) as Tx[]).map((t) => {
    const plain = { ...(t as unknown as Record<string, unknown>) };
    if (approvalOf(t) === "pending") Object.assign(plain, { approval: "rejected", ...who, reviewNote: `Closed: status changed to ${input.status.replace("_", " ")}` });
    return plain;
  });
  let paid = before.paidPaise;
  if (target < paid) {
    // Going down: void every approved payment, then put back the new total as one adjustment.
    txs = txs.map((t) => (!t.voidedAt && (t.approval ?? "confirmed") === "confirmed" ? { ...t, voidedAt: now, voidedByEmail: actor.email, voidReason: `Status changed: ${input.reason}` } : t));
    paid = 0;
  }
  if (target > paid) {
    txs.push({
      _id: txId(),
      amountPaise: target - paid,
      method: "other",
      reference: "",
      note: `Status changed to ${input.status.replace("_", " ")}: ${input.reason}`,
      paidAt: now,
      recordedById: Types.ObjectId.isValid(actor.id) ? actor.id : null,
      recordedByEmail: actor.email,
      recordedByName: actor.name,
      idempotencyKey: `status-${String(txId())}`,
      selfReported: false,
      approval: "confirmed",
      adjustment: true,
      createdAt: now,
    });
  }
  const after = await PartyPayment.findOneAndUpdate(
    { _id: before._id, revision: before.revision ?? 0 },
    { $set: { transactions: txs, paidPaise: target, status: storedStatus(total, target) }, $inc: { revision: 1 } },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!after) throw conflict("This payment was changed meanwhile. Reload and try again.");
  await audit({ action: "payment.status_change", entityType: "PartyPayment", entityId: paymentId, actorId: actor.id, previousValue: { paidPaise: before.paidPaise, status: before.status }, newValue: { paidPaise: target, status: after.status }, reason: input.reason });
  return after;
}

/** For the approval email: the request, who should approve it, and the party. */
export async function getApprovalRequest(paymentId: string, transactionId: string) {
  await connectDB();
  const p = (await PartyPayment.findById(paymentId).lean()) as PaymentLean | null;
  if (!p) return null;
  const tx = findTx(p, transactionId);
  if (!tx || approvalOf(tx) !== "pending") return null;
  const event = (await PartyEvent.findById(p.eventId).lean()) as EventLean | null;
  if (!event) return null;
  const roles = await rolesOf(event._id);
  const payee = payeeOf(await buildCtx(event, roles), p);
  const receiverEmail = p.payeeRoleId ? (roles.find((r) => String(r._id) === String(p.payeeRoleId))?.email ?? null) : (event.organizerEmail ?? null);
  const admins = await User.find({ role: { $in: ["admin", "super_admin"] }, isActive: true }).select({ email: 1 }).lean();
  const to = [...new Set([receiverEmail, ...admins.map((a) => a.email)].filter((e): e is string => !!e).map(lower))].filter((e) => e !== lower(p.payerEmail));
  return { to, payerName: p.payerName, payeeName: payee.name, amount: fromPaise(tx.amountPaise), method: tx.method as PaymentMethod, reference: tx.reference ?? "", kind: p.kind as PaymentKind, event };
}

/* ------------------------------ party lifecycle ------------------------------ */

/** Lender/provider is a separate model from the contri split, so the two can't be combined. */
export async function assertPaymentModelChange(opts: { eventId?: Types.ObjectId; category: string; before?: PaymentModel; next: PaymentModel }) {
  if (opts.next === "lender_provider" && opts.category === "contri") {
    throw badRequest("Contri parties use the contri split. Pick another category for money givers & providers.");
  }
  if (opts.eventId && opts.before === "lender_provider" && opts.next !== "lender_provider") {
    await connectDB();
    if (await PartyMoneyRole.exists({ eventId: opts.eventId })) {
      throw conflict("Remove this party's money givers and providers before switching its payment model");
    }
  }
}

/** The party giver changed: they are now the one repaying borrowed money. */
export async function syncBorrower(eventId: Types.ObjectId, organizerName: string, organizerEmail: string | null | undefined) {
  await PartyPayment.updateMany({ eventId, kind: "lend" }, { $set: { payerName: organizerName, payerEmail: organizerEmail ? lower(organizerEmail) : null } });
}

/* ------------------------------ contri parties ------------------------------ */

/**
 * Contri party: one share per participant (the host excluded) for the per-head amount, paid to
 * the host. Kept in sync with the split; idempotent. Shares already paid against are never
 * removed, and shares edited by hand ("manual") are left alone.
 */
export async function syncContriShares(eventId: Types.ObjectId | string) {
  await connectDB();
  const event = (await PartyEvent.findById(eventId).lean()) as EventLean | null;
  if (!event) return;
  const split = event.category === "contri" && event.status !== "cancelled" ? computeContriSplit(event) : null;
  const perHead = split ? toPaise(split.perHead) : 0;

  const host = new Set([personKey({ name: event.organizerName, email: event.organizerEmail }), personKey({ name: event.organizerName })]);
  const payers = new Map<string, { name: string; email: string | null }>();
  for (const p of event.participants ?? []) {
    if (!p.name && !p.email) continue;
    const k = personKey(p);
    // The host pays nobody (same matching as the contri headcount: by email, or by name without one).
    if (host.has(k) || payers.has(k)) continue;
    payers.set(k, { name: p.name, email: p.email ? lower(p.email) : null });
  }
  const wanted = split ? payers : new Map<string, { name: string; email: string | null }>();

  const existing = (await PartyPayment.find({ eventId: event._id, kind: "share" }).lean()) as PaymentLean[];
  const byKey = new Map(existing.map((p) => [p.dedupeKey ?? "", p]));
  for (const [k, person] of wanted) {
    const cur = byKey.get(`share:${k}`);
    if (!cur) {
      await PartyPayment.create({ eventId: event._id, kind: "share", source: "contri", payerName: person.name, payerEmail: person.email, payeeRoleId: null, amountPaise: perHead, dedupeKey: `share:${k}` }).catch((err) => {
        if ((err as { code?: number }).code !== 11000) throw err; // created meanwhile
      });
    } else if (cur.source === "contri" && cur.amountPaise !== Math.max(perHead, cur.paidPaise)) {
      // Never below what was already paid, so the due can't go negative.
      const amountPaise = Math.max(perHead, cur.paidPaise);
      await PartyPayment.updateOne({ _id: cur._id, revision: cur.revision ?? 0 }, { $set: { amountPaise, status: storedStatus(amountPaise, cur.paidPaise) }, $inc: { revision: 1 } });
    }
  }
  const stale = existing.filter((p) => p.source === "contri" && !wanted.has((p.dedupeKey ?? "").replace(/^share:/, "")) && p.paidPaise === 0 && !(p.transactions ?? []).some((t) => !t.voidedAt));
  if (stale.length) await PartyPayment.deleteMany({ _id: { $in: stale.map((p) => p._id) }, paidPaise: 0 });
}

export type ContriPaymentState = {
  /** Shares on the party, and how many are fully paid. */
  shares: number;
  paidShares: number;
  /** Every share is fully paid: no QR codes anywhere. */
  allPaid: boolean;
  /** The viewer's own share, if they have one. */
  mine: PaymentView | null;
};

/** For the contri card on party pages: is everything paid, and what does this viewer still owe? */
export async function getContriPaymentState(eventId: string, viewer?: PaymentActor | null): Promise<ContriPaymentState | null> {
  await connectDB();
  const event = await loadEvent(eventId);
  if (event.category !== "contri") return null;
  await syncContriShares(event._id);
  const shares = (await PartyPayment.find({ eventId: event._id, kind: "share" }).lean()) as PaymentLean[];
  if (!shares.length) return null;
  const paidShares = shares.filter((p) => remainingPaise(p.amountPaise, p.paidPaise) === 0).length;
  let mine: PaymentView | null = null;
  if (viewer) {
    const own = shares.find((p) => p.payerEmail && lower(p.payerEmail) === lower(viewer.email));
    if (own) {
      const roles = await rolesOf(event._id);
      mine = toView(await buildCtx(event, roles), own, accessFor(event, roles, viewer));
    }
  }
  return { shares: shares.length, paidShares, allPaid: paidShares === shares.length, mine };
}

/** Called when a party is deleted. */
export async function deleteEventPayments(eventId: Types.ObjectId) {
  await PartyPayment.deleteMany({ eventId });
  await PartyMoneyRole.deleteMany({ eventId });
}
