import { describe, expect, it } from "vitest";
import { AuditLog, PartyMoneyRole, PartyPayment, User } from "@/models";
import { fromPaise, remainingPaise, storedStatus, toPaise, viewStatus } from "@/lib/payments";
import { CreateEventSchema, MoneyRoleCreateSchema, PaymentCreateSchema, PaymentRecordSchema, PaymentUpdateSchema, UpdateEventSchema } from "@/lib/validation";
import { createEvent, deleteEvent, updateEvent } from "@/services/event.service";
import {
  createMoneyRole,
  createPayment,
  deleteMoneyRole,
  deletePayment,
  getPartyPayments,
  getPaymentUpiLink,
  listMyPayments,
  recordPayment,
  updatePayment,
  voidTransaction,
  type PaymentActor,
} from "@/services/payment.service";
import { baseEvent, makeAdmin } from "./helpers";

let n = 0;
const key = () => `key-${++n}-abcdefgh`;
const pay = (amount?: number, extra: Record<string, unknown> = {}) => PaymentRecordSchema.parse({ ...(amount !== undefined ? { amount } : {}), idempotencyKey: key(), ...extra });

async function member(email: string, name: string, upiId = ""): Promise<PaymentActor> {
  const u = await User.create({ email, name, role: "member", upiId });
  return { id: String(u._id), email, name, role: "member" };
}

async function setup(over: Record<string, unknown> = {}) {
  const bossId = await makeAdmin();
  const boss: PaymentActor = { id: bossId, email: "boss@party.test", name: "Boss", role: "super_admin" };
  const host = await member("host@team.test", "Host", "host@okhdfc");
  const priya = await member("priya@team.test", "Priya");
  const ravi = await member("ravi@team.test", "Ravi");
  const event = await createEvent(
    CreateEventSchema.parse(baseEvent({ title: "Team Dinner", organizerName: "Host", organizerEmail: "host@team.test", budget: 5000, participants: [{ name: "Priya", email: "priya@team.test" }, { name: "Ravi", email: "ravi@team.test" }], ...over })),
    bossId
  );
  return { boss, host, priya, ravi, eventId: String(event._id) };
}

const share = (payerName: string, payerEmail: string | null, amount: number, extra: Record<string, unknown> = {}) =>
  PaymentCreateSchema.parse({ payerName, payerEmail: payerEmail ?? "", amount, ...extra });

describe("payment maths", () => {
  it("works in paise, never goes negative, and derives the status", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(() => toPaise(10.005)).toThrow();
    expect(fromPaise(150050)).toBe(1500.5);
    expect(remainingPaise(100, 150)).toBe(0);
    expect(storedStatus(1000, 0)).toBe("pending");
    expect(storedStatus(1000, 400)).toBe("partially_paid");
    expect(storedStatus(1000, 1000)).toBe("paid");
    expect(viewStatus(1000, 400, "2026-01-01", "2026-01-02")).toBe("overdue");
    expect(viewStatus(1000, 400, "2026-01-02", "2026-01-02")).toBe("partially_paid");
    expect(viewStatus(1000, 1000, "2026-01-01", "2026-02-01")).toBe("paid");
  });

  it("rejects zero, negative and sub-paisa amounts", () => {
    expect(() => PaymentCreateSchema.parse({ payerName: "A", amount: 0 })).toThrow();
    expect(() => PaymentCreateSchema.parse({ payerName: "A", amount: -5 })).toThrow();
    expect(() => PaymentCreateSchema.parse({ payerName: "A", amount: 1.234 })).toThrow();
    expect(() => MoneyRoleCreateSchema.parse({ role: "lender", name: "L" })).toThrow();
  });
});

describe("individual shares", () => {
  it("tracks partial payments, updates the due and the QR amount, and refuses overpayment", async () => {
    const { host, priya, eventId } = await setup();
    const p = await createPayment(eventId, share("Priya", "priya@team.test", 2000), host);
    const id = String(p!._id);

    expect(await getPaymentUpiLink(eventId, id, priya)).toContain("am=2000.00");
    await recordPayment(eventId, id, pay(750.5, { method: "cash" }), host);
    const link = await getPaymentUpiLink(eventId, id, priya);
    expect(link).toContain("am=1249.50");
    expect(link).toContain("pa=host%40okhdfc");

    await expect(recordPayment(eventId, id, pay(1249.51), host)).rejects.toMatchObject({ status: 400 });
    const data = await getPartyPayments(eventId, host);
    expect(data.payments[0]).toMatchObject({ total: 2000, paid: 750.5, due: 1249.5, status: "partially_paid" });
    expect(data.payments[0].transactions[0]).toMatchObject({ amount: 750.5, method: "cash", recordedByEmail: "host@team.test" });

    // No amount = settle the rest. Then: no QR, and no further payments.
    await recordPayment(eventId, id, pay(), host);
    const after = (await getPartyPayments(eventId, host)).payments[0];
    expect(after).toMatchObject({ paid: 2000, due: 0, status: "paid", upiLink: null });
    await expect(recordPayment(eventId, id, pay(1), host)).rejects.toMatchObject({ status: 409 });
  });

  it("applies a repeated submit once and refuses a reused transaction reference", async () => {
    const { host, eventId } = await setup();
    const a = await createPayment(eventId, share("Priya", "priya@team.test", 1000), host);
    const b = await createPayment(eventId, share("Ravi", "ravi@team.test", 1000), host);
    const input = pay(400, { reference: "UPI123" });

    const [r1, r2] = await Promise.all([recordPayment(eventId, String(a!._id), input, host), recordPayment(eventId, String(a!._id), input, host)]);
    expect([r1.duplicate, r2.duplicate].sort()).toEqual([false, true]);
    const doc = await PartyPayment.findById(a!._id).lean();
    expect(doc).toMatchObject({ paidPaise: 40000, status: "partially_paid" });
    expect(doc!.transactions).toHaveLength(1);

    await expect(recordPayment(eventId, String(b!._id), pay(100, { reference: "UPI123" }), host)).rejects.toMatchObject({ status: 409 });
  });

  it("one share per person; amount can't drop below what was paid; paid records can't be deleted, only voided", async () => {
    const { host, eventId } = await setup();
    const p = await createPayment(eventId, share("Priya", "priya@team.test", 1000, { dueDate: "2020-01-01" }), host);
    const id = String(p!._id);
    await expect(createPayment(eventId, share("Priya", "PRIYA@team.test", 500), host)).rejects.toMatchObject({ status: 409 });
    expect((await getPartyPayments(eventId, host)).payments[0].status).toBe("overdue");

    const { payment } = await recordPayment(eventId, id, pay(600), host);
    await expect(updatePayment(eventId, id, PaymentUpdateSchema.parse({ amount: 500 }), host)).rejects.toMatchObject({ status: 400 });
    await expect(updatePayment(eventId, id, PaymentUpdateSchema.parse({ payerName: "Ravi", payerEmail: "ravi@team.test" }), host)).rejects.toMatchObject({ status: 409 });
    await updatePayment(eventId, id, PaymentUpdateSchema.parse({ amount: 600 }), host);
    expect((await PartyPayment.findById(id).lean())!.status).toBe("paid");
    await expect(deletePayment(eventId, id, host)).rejects.toMatchObject({ status: 409 });

    const txId = String((payment.transactions[0] as { _id: unknown })._id);
    await voidTransaction(eventId, id, txId, { reason: "Recorded on the wrong person" }, host);
    await expect(voidTransaction(eventId, id, txId, { reason: "again" }, host)).rejects.toMatchObject({ status: 409 });
    const voided = (await getPartyPayments(eventId, host)).payments[0];
    expect(voided).toMatchObject({ paid: 0, due: 600 });
    expect(voided.transactions[0]).toMatchObject({ voided: true, voidReason: "Recorded on the wrong person" });
    await deletePayment(eventId, id, host);
    expect(await AuditLog.countDocuments({ action: { $in: ["payment.create", "payment.record", "payment.void", "payment.delete"] } })).toBe(4);
  });
});

describe("access control", () => {
  it("participants see only their own payments; strangers see nothing and can't change anything", async () => {
    const { host, priya, ravi, eventId } = await setup();
    const p = await createPayment(eventId, share("Priya", "priya@team.test", 1000), host);
    await createPayment(eventId, share("Ravi", "ravi@team.test", 1500), host);
    const stranger = await member("x@team.test", "X");

    const mine = await getPartyPayments(eventId, priya);
    expect(mine.canManage).toBe(false);
    expect(mine.payments.map((x) => x.payerName)).toEqual(["Priya"]);
    expect(mine.payments[0]).toMatchObject({ isMine: true, canRecord: false });
    expect((await getPartyPayments(eventId, stranger)).payments).toHaveLength(0);
    expect((await listMyPayments(ravi))[0].payments.map((x) => x.total)).toEqual([1500]);

    await expect(getPaymentUpiLink(eventId, String(p!._id), ravi)).rejects.toMatchObject({ status: 404 });
    await expect(recordPayment(eventId, String(p!._id), pay(1000), priya)).rejects.toMatchObject({ status: 403 });
    await expect(createPayment(eventId, share("Me", "x@team.test", 1), stranger)).rejects.toMatchObject({ status: 403 });
    await expect(updatePayment(eventId, String(p!._id), PaymentUpdateSchema.parse({ amount: 1 }), priya)).rejects.toMatchObject({ status: 403 });
  });
});

describe("lenders & providers", () => {
  it("is a separate model: not on contri parties, needs the model switched on, and can't be switched off while in use", async () => {
    const { boss, host, eventId } = await setup();
    await expect(createEvent(CreateEventSchema.parse(baseEvent({ category: "contri", paymentModel: "lender_provider" })), boss.id)).rejects.toMatchObject({ status: 400 });
    await expect(createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "provider", name: "Priya" }), host)).rejects.toMatchObject({ status: 400 });

    await updateEvent(eventId, UpdateEventSchema.parse({ paymentModel: "lender_provider" }), boss.id);
    await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "provider", name: "Priya", email: "priya@team.test" }), host);
    await expect(updateEvent(eventId, UpdateEventSchema.parse({ paymentModel: "standard" }), boss.id)).rejects.toMatchObject({ status: 409 });
    await expect(updateEvent(eventId, UpdateEventSchema.parse({ category: "contri" }), boss.id)).rejects.toMatchObject({ status: 400 });
  });

  it("tracks money lent vs collected vs due; providers record what they receive, and only that", async () => {
    const { host, priya, ravi, eventId } = await setup({ paymentModel: "lender_provider" });
    const provider = await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "provider", name: "Priya", email: "priya@team.test", upiId: "priya@ybl" }), host);
    const lender = await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "Ravi", email: "ravi@team.test", expectedAmount: 3000, payeeRoleId: String(provider._id) }), host);
    await expect(createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "Ravi", email: "ravi@team.test", expectedAmount: 1 }), host)).rejects.toMatchObject({ status: 409 });

    const lend = await PartyPayment.findOne({ eventId, kind: "lend" }).lean();
    expect(lend).toMatchObject({ payerName: "Ravi", amountPaise: 300000 });
    // The lender sees their own obligation, with a QR that pays the provider.
    expect(await getPaymentUpiLink(eventId, String(lend!._id), ravi)).toContain("pa=priya%40ybl");

    const s1 = await createPayment(eventId, share("Asha", null, 1200, { payeeRoleId: String(provider._id) }), host);
    const s2 = await createPayment(eventId, share("Dev", null, 800), host); // pays the giver
    await recordPayment(eventId, String(lend!._id), pay(2000), priya); // provider received 2000 of the lent money
    await recordPayment(eventId, String(s1!._id), pay(1200), priya);
    await expect(recordPayment(eventId, String(s2!._id), pay(100), priya)).rejects.toMatchObject({ status: 403 });

    const { summary } = await getPartyPayments(eventId, host);
    expect(summary).toMatchObject({ budget: 5000, assigned: 2000, collected: 1200, lent: 3000, lentProvided: 2000, lentDue: 1000, paid: 3200, outstanding: 1800 });
    expect(summary.counts).toMatchObject({ all: 3, paid: 1, partially_paid: 1, pending: 1 });

    // The provider's own view: what they collect.
    const collect = await getPartyPayments(eventId, priya);
    expect(collect.payments.filter((x) => x.canRecord).map((x) => x.payerName).sort()).toEqual(["Asha", "Ravi"]);

    await expect(deleteMoneyRole(eventId, String(provider._id), host)).rejects.toMatchObject({ status: 409 });
    await expect(deleteMoneyRole(eventId, String(lender._id), host)).rejects.toMatchObject({ status: 409 });
  });

  it("deleting a party removes its payments, lenders and providers", async () => {
    const { boss, host, eventId } = await setup({ paymentModel: "lender_provider" });
    await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "L", expectedAmount: 100 }), host);
    await createPayment(eventId, share("A", null, 10), host);
    await deleteEvent(eventId, boss.id);
    expect(await PartyPayment.countDocuments({})).toBe(0);
    expect(await PartyMoneyRole.countDocuments({})).toBe(0);
  });
});
