import { describe, expect, it } from "vitest";
import { AuditLog, PartyMoneyRole, PartyPayment, User } from "@/models";
import { fromPaise, remainingPaise, storedStatus, toPaise, viewStatus } from "@/lib/payments";
import { CreateEventSchema, MoneyRoleCreateSchema, PaymentCreateSchema, PaymentRecordSchema, PaymentReviewSchema, PaymentStatusSchema, PaymentUpdateSchema, UpdateEventSchema } from "@/lib/validation";
import { ScheduledJob } from "@/models";
import { createEvent, deleteEvent, updateEvent } from "@/services/event.service";
import { contriThankYouEmail } from "@/lib/email-templates";
import {
  createMoneyRole,
  createPayment,
  deleteMoneyRole,
  deletePayment,
  getContriPaymentState,
  reviewPayment,
  setPaymentStatus,
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

/** The id of the payment's request that is waiting for approval. */
async function pendingTx(eventId: string, paymentId: string, viewer: PaymentActor) {
  const p = (await getPartyPayments(eventId, viewer)).payments.find((x) => x._id === paymentId)!;
  return p.transactions.find((t) => t.approval === "pending")!._id;
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
    expect(mine.payments[0]).toMatchObject({ isMine: true, canRecord: true });
    expect((await getPartyPayments(eventId, stranger)).payments).toHaveLength(0);
    expect((await listMyPayments(ravi))[0].payments.map((x) => x.total)).toEqual([1500]);

    await expect(getPaymentUpiLink(eventId, String(p!._id), ravi)).rejects.toMatchObject({ status: 404 });
    // Anyone else can't record Priya's payment...
    await expect(recordPayment(eventId, String(p!._id), pay(1000), ravi)).rejects.toMatchObject({ status: 403 });
    // ...Priya can say she paid, but it only counts once the giver (who received it) approves.
    await recordPayment(eventId, String(p!._id), pay(1000), priya);
    expect((await getPartyPayments(eventId, host)).payments.find((x) => x.payerName === "Priya")).toMatchObject({ status: "pending", paid: 0, awaitingApproval: 1000, requestable: 0, upiLink: null, transactions: [{ selfReported: true, approval: "pending" }] });
    await reviewPayment(eventId, String(p!._id), await pendingTx(eventId, String(p!._id), host), PaymentReviewSchema.parse({ decision: "approve" }), host);
    expect((await getPartyPayments(eventId, host)).payments.find((x) => x.payerName === "Priya")).toMatchObject({ status: "paid", paid: 1000, transactions: [{ approval: "confirmed" }] });
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

  it("the party giver repays the money giver; shares can be paid straight to the money giver, who confirms what they receive", async () => {
    const { boss, host, priya, ravi, eventId } = await setup({ paymentModel: "lender_provider" });
    await User.updateOne({ email: "ravi@team.test" }, { $set: { upiId: "ravi@okicici" } });
    const provider = await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "provider", name: "Priya", email: "priya@team.test", upiId: "priya@ybl" }), host);
    const giver = await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "Ravi", email: "ravi@team.test", lentAmount: 3000, dueDate: "2099-01-01" }), host);
    await expect(createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "Ravi", email: "ravi@team.test", lentAmount: 1 }), host)).rejects.toMatchObject({ status: 409 });

    // The borrowed money: the party giver owes it to Ravi, and the QR pays Ravi's (profile) UPI ID.
    const lend = await PartyPayment.findOne({ eventId, kind: "lend" }).lean();
    expect(lend).toMatchObject({ payerName: "Host", payerEmail: "host@team.test", amountPaise: 300000 });
    expect(String(lend!.payeeRoleId)).toBe(String(giver._id));
    expect(await getPaymentUpiLink(eventId, String(lend!._id), host)).toContain("pa=ravi%40okicici");
    expect((await listMyPayments(host))[0].payments[0]).toMatchObject({ kind: "lend", isMine: true, due: 3000 });

    const asha = await createPayment(eventId, share("Asha", null, 1200, { payeeRoleId: String(giver._id) }), host); // pays the money giver directly
    const dev = await createPayment(eventId, share("Dev", null, 800, { payeeRoleId: String(provider._id) }), host);
    expect(await getPaymentUpiLink(eventId, String(asha!._id), host)).toContain("pa=ravi%40okicici");

    // Ravi confirms the money he received (repayment + Asha's share); not money that went to Priya.
    await recordPayment(eventId, String(lend!._id), pay(2000), ravi);
    await recordPayment(eventId, String(asha!._id), pay(1200), ravi);
    await expect(recordPayment(eventId, String(dev!._id), pay(100), ravi)).rejects.toMatchObject({ status: 403 });
    await expect(updatePayment(eventId, String(lend!._id), PaymentUpdateSchema.parse({ payeeRoleId: String(provider._id) }), host)).rejects.toMatchObject({ status: 400 });

    const { summary } = await getPartyPayments(eventId, host);
    expect(summary).toMatchObject({ budget: 5000, assigned: 2000, collected: 1200, lent: 3000, lentRepaid: 2000, lentDue: 1000, paid: 3200, outstanding: 1800 });
    expect(summary.counts).toMatchObject({ all: 3, paid: 1, partially_paid: 1, pending: 1 });
    expect((await getPartyPayments(eventId, ravi)).payments.filter((x) => x.canRecord).map((x) => x.payerName).sort()).toEqual(["Asha", "Host"]);
    expect((await getPartyPayments(eventId, priya)).payments.map((x) => x.payerName)).toEqual(["Dev"]);

    await expect(deleteMoneyRole(eventId, String(provider._id), host)).rejects.toMatchObject({ status: 409 });
    await expect(deleteMoneyRole(eventId, String(giver._id), host)).rejects.toMatchObject({ status: 409 });

    // A new party giver takes over the repayment.
    await updateEvent(eventId, UpdateEventSchema.parse({ organizerName: "Neha", organizerEmail: "neha@team.test" }), boss.id);
    expect(await PartyPayment.findById(lend!._id).lean()).toMatchObject({ payerName: "Neha", payerEmail: "neha@team.test" });
  });

  it("deleting a party removes its payments, lenders and providers", async () => {
    const { boss, host, eventId } = await setup({ paymentModel: "lender_provider" });
    await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "L", lentAmount: 100 }), host);
    await createPayment(eventId, share("A", null, 10), host);
    await deleteEvent(eventId, boss.id);
    expect(await PartyPayment.countDocuments({})).toBe(0);
    expect(await PartyMoneyRole.countDocuments({})).toBe(0);
  });
});

describe("contri parties", () => {
  const five = [
    { name: "Host", email: "host@team.test" },
    { name: "Priya", email: "priya@team.test" },
    { name: "Ravi", email: "ravi@team.test" },
    { name: "Neha", email: "neha@team.test" },
    { name: "Arjun", email: "arjun@team.test" },
  ];
  const contri = (over: Record<string, unknown> = {}) => ({ category: "contri", participants: five, contri: { totalAmount: 100 }, ...over });

  it("splits automatically: one share per participant (not the host), paid to the host, following the split", async () => {
    const { boss, host, eventId } = await setup(contri());
    let rows = (await getPartyPayments(eventId, host)).payments;
    expect(rows.map((r) => [r.payerName, r.total, r.payee.role, r.auto])).toEqual([
      ["Priya", 20, "host", true],
      ["Ravi", 20, "host", true],
      ["Neha", 20, "host", true],
      ["Arjun", 20, "host", true],
    ]);
    expect(rows[0].upiLink).toContain("pa=host%40okhdfc&pn=Host&am=20.00");
    await expect(deletePayment(eventId, rows[0]._id, host)).rejects.toMatchObject({ status: 400 });

    // Ravi pays 20; then the split changes and Arjun leaves.
    await recordPayment(eventId, rows[1]._id, pay(), host);
    await updateEvent(eventId, UpdateEventSchema.parse({ participants: five.filter((p) => p.name !== "Arjun"), contri: { totalAmount: 40 } }), boss.id);
    rows = (await getPartyPayments(eventId, host)).payments;
    // 40 / 4 people = 10 each; Ravi already paid 20, so his share stays 20 (never a negative due).
    expect(rows.map((r) => [r.payerName, r.total, r.due])).toEqual([
      ["Priya", 10, 10],
      ["Ravi", 20, 0],
      ["Neha", 10, 10],
    ]);

    // Edited by hand: the split leaves it alone.
    await updatePayment(eventId, rows[0]._id, PaymentUpdateSchema.parse({ amount: 15 }), host);
    await updateEvent(eventId, UpdateEventSchema.parse({ contri: { totalAmount: 80 } }), boss.id);
    rows = (await getPartyPayments(eventId, host)).payments;
    expect(rows.map((r) => [r.payerName, r.total, r.auto])).toEqual([
      ["Priya", 15, false],
      ["Ravi", 20, true],
      ["Neha", 20, true],
    ]);
  });

  it("hides the QR for whoever has paid, and everywhere once everyone has", async () => {
    const { host, priya, ravi, eventId } = await setup(contri({ participants: five.slice(0, 3), contri: { totalAmount: 150 } }));
    let st = await getContriPaymentState(eventId, priya);
    expect(st).toMatchObject({ shares: 2, paidShares: 0, allPaid: false, mine: { payerName: "Priya", due: 50, canRecord: true } });
    expect(st!.mine!.upiLink).toContain("am=50.00");

    const id = st!.mine!._id;
    const approve = async () => reviewPayment(eventId, id, await pendingTx(eventId, id, host), PaymentReviewSchema.parse({ decision: "approve" }), host);
    await recordPayment(eventId, id, pay(20), priya); // partial, reported by Priya: waits for the host
    // Not counted yet, but the QR is only for what she hasn't reported.
    expect((await getContriPaymentState(eventId, priya))!.mine).toMatchObject({ due: 50, awaitingApproval: 20, requestable: 30, upiLink: expect.stringContaining("am=30.00") });
    await approve();
    expect((await getContriPaymentState(eventId, priya))!.mine).toMatchObject({ due: 30, awaitingApproval: 0, upiLink: expect.stringContaining("am=30.00") });
    await recordPayment(eventId, id, pay(), priya);
    expect((await getContriPaymentState(eventId, priya))!.mine).toMatchObject({ due: 30, requestable: 0, upiLink: null });
    await approve();
    st = await getContriPaymentState(eventId, priya);
    expect(st).toMatchObject({ paidShares: 1, allPaid: false, mine: { due: 0, upiLink: null } });

    const raviShare = (await getContriPaymentState(eventId, ravi))!.mine!;
    await recordPayment(eventId, raviShare._id, pay(), host);
    expect(await getContriPaymentState(eventId, null)).toMatchObject({ allPaid: true, paidShares: 2 });

    const split = { total: 150, headcount: 3, perHead: 50, payers: 2, upiId: "host@okhdfc", upiLink: "upi://pay?pa=host%40okhdfc&am=50.00" };
    const event = { title: "Pizza", organizerName: "Host", eventDate: new Date(), _id: eventId, category: "contri" };
    const open = contriThankYouEmail(event as never, split, [], Buffer.from("png"));
    const settled = contriThankYouEmail(event as never, split, [], Buffer.from("png"), true);
    expect(open.attachments).toHaveLength(1);
    expect(settled.attachments).toBeUndefined();
    expect(settled.html).not.toContain("upi://");
    expect(settled.html).toContain("All settled");
  });
});

describe("payment approvals & status changes", () => {
  it("the party giver repaying a money giver can only ask for approval; the money giver or an admin approves", async () => {
    const { boss, host, ravi, priya, eventId } = await setup({ paymentModel: "lender_provider" });
    const b = await createMoneyRole(eventId, MoneyRoleCreateSchema.parse({ role: "lender", name: "Ravi", email: "ravi@team.test", lentAmount: 3000 }), host);
    const lend = (await PartyPayment.findOne({ eventId, kind: "lend" }).lean())!;
    const id = String(lend._id);
    expect(String(lend.payeeRoleId)).toBe(String(b._id));

    // A (the party giver, who manages the party) can't just mark the repayment paid: it's a request.
    const res = await recordPayment(eventId, id, pay(1000, { reference: "UPI-A1" }), host);
    expect(res).toMatchObject({ awaitingApproval: true, payment: { paidPaise: 0, status: "pending" } });
    const view = (await getPartyPayments(eventId, host)).payments.find((x) => x._id === id)!;
    expect(view).toMatchObject({ canConfirm: false, canRequest: true, awaitingApproval: 1000, requestable: 2000 });
    // B and the admins are asked; A isn't.
    const job = (await ScheduledJob.findOne({ jobType: "payment_approval_request" }).lean())!;
    const { getApprovalRequest } = await import("@/services/payment.service");
    const req = (await getApprovalRequest(String(job.payload.paymentId), String(job.payload.txId)))!;
    expect(req.to.sort()).toEqual(["boss@party.test", "ravi@team.test"]);
    expect(req).toMatchObject({ payerName: "Host", payeeName: "Ravi", amount: 1000 });

    const tx = await pendingTx(eventId, id, ravi);
    // A can't approve their own payment, nor can a bystander or a manager-less member.
    await expect(reviewPayment(eventId, id, tx, PaymentReviewSchema.parse({ decision: "approve" }), host)).rejects.toMatchObject({ status: 403 });
    await expect(reviewPayment(eventId, id, tx, PaymentReviewSchema.parse({ decision: "approve" }), priya)).rejects.toMatchObject({ status: 403 });
    // Can't report more than what isn't already waiting.
    await expect(recordPayment(eventId, id, pay(2500), host)).rejects.toMatchObject({ status: 400 });

    await reviewPayment(eventId, id, tx, PaymentReviewSchema.parse({ decision: "approve" }), ravi);
    expect((await PartyPayment.findById(id).lean())).toMatchObject({ paidPaise: 100000, status: "partially_paid" });
    await expect(reviewPayment(eventId, id, tx, PaymentReviewSchema.parse({ decision: "approve" }), ravi)).rejects.toMatchObject({ status: 409 });

    // Another request: rejected by an admin (needs a reason), one more withdrawn by A.
    await recordPayment(eventId, id, pay(500), host);
    const tx2 = await pendingTx(eventId, id, host);
    expect(() => PaymentReviewSchema.parse({ decision: "reject" })).toThrow();
    await reviewPayment(eventId, id, tx2, PaymentReviewSchema.parse({ decision: "reject", note: "Nothing arrived" }), boss);
    await recordPayment(eventId, id, pay(500), host);
    await reviewPayment(eventId, id, await pendingTx(eventId, id, host), PaymentReviewSchema.parse({ decision: "withdraw" }), host);
    const after = (await getPartyPayments(eventId, ravi)).payments.find((x) => x._id === id)!;
    expect(after).toMatchObject({ paid: 1000, due: 2000, awaitingApproval: 0 });
    expect(after.transactions.map((t) => t.approval)).toEqual(["confirmed", "rejected", "rejected"]);

    // The receiver confirms directly when the money arrives (no request needed).
    await recordPayment(eventId, id, pay(500), ravi);
    expect((await PartyPayment.findById(id).lean())!.paidPaise).toBe(150000);
  });

  it("change status: receiver or admin, never the payer; every change stays in the history", async () => {
    const { boss, host, priya, ravi, eventId } = await setup();
    const p = (await createPayment(eventId, share("Priya", "priya@team.test", 1000), host))!;
    const id = String(p._id);
    const status = (s: Record<string, unknown>) => PaymentStatusSchema.parse({ reason: "Paid in cash at the party", ...s });

    await expect(setPaymentStatus(eventId, id, status({ status: "paid" }), priya)).rejects.toMatchObject({ status: 403 });
    await expect(setPaymentStatus(eventId, id, status({ status: "paid" }), ravi)).rejects.toMatchObject({ status: 403 });
    expect(() => PaymentStatusSchema.parse({ status: "partially_paid", reason: "x" })).toThrow();

    // A pending request is closed by the status change.
    await recordPayment(eventId, id, pay(200), priya);
    await setPaymentStatus(eventId, id, status({ status: "partially_paid", paidAmount: 400 }), host);
    let v = (await getPartyPayments(eventId, host)).payments[0];
    expect(v).toMatchObject({ paid: 400, due: 600, status: "partially_paid", awaitingApproval: 0 });
    expect(v.transactions.map((t) => [t.approval, t.adjustment])).toEqual([["rejected", false], ["confirmed", true]]);

    await setPaymentStatus(eventId, id, status({ status: "paid" }), boss);
    expect((await getPartyPayments(eventId, host)).payments[0]).toMatchObject({ paid: 1000, due: 0, status: "paid", upiLink: null });

    await setPaymentStatus(eventId, id, status({ status: "pending", reason: "Recorded by mistake" }), host);
    v = (await getPartyPayments(eventId, host)).payments[0];
    expect(v).toMatchObject({ paid: 0, due: 1000, status: "pending" });
    expect(v.transactions.filter((t) => t.approval === "confirmed").every((t) => t.voided)).toBe(true);
    await expect(setPaymentStatus(eventId, id, status({ status: "pending" }), host)).rejects.toMatchObject({ status: 409 });
    await expect(setPaymentStatus(eventId, id, status({ status: "partially_paid", paidAmount: 1000 }), host)).rejects.toMatchObject({ status: 400 });
  });
});
