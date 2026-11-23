import { afterEach, describe, expect, it, vi } from "vitest";
import { PartyEvent, ScheduledJob, User } from "@/models";
import { claimNextJob } from "@/lib/scheduler";
import * as email from "@/lib/email";
import { computeContriSplit, defaultHeadcount, roundUpToPaisa, upiPayLink } from "@/lib/contri";
import { CreateEventSchema, UpdateEventSchema, UserCreateSchema } from "@/lib/validation";
import { createEvent, getEventContriSplit, setEventStatus, updateEvent } from "@/services/event.service";
import { processJob } from "@/services/notification.service";
import { createUser } from "@/services/user.service";
import { baseEvent, makeAdmin } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const five = [
  { name: "Priya", email: "priya@team.test" },
  { name: "Ravi", email: "ravi@team.test" },
  { name: "Neha", email: "neha@team.test" },
  { name: "Arjun", email: "arjun@team.test" },
];
const contriEvent = (over: Record<string, unknown> = {}) =>
  CreateEventSchema.parse(baseEvent({ category: "contri", title: "Pizza Friday", organizerName: "Host", organizerEmail: "host@team.test", participants: five, ...over }));

describe("contri split maths", () => {
  it("₹100 between 5 people (host included) is ₹20 each, paid to the host's UPI ID", () => {
    const s = computeContriSplit(
      { category: "contri", title: "Pizza", organizerName: "Host", organizerEmail: "host@team.test", participants: five, contri: { totalAmount: 100 } },
      "host@okhdfc"
    )!;
    expect(s).toMatchObject({ total: 100, headcount: 5, perHead: 20, payers: 4, upiId: "host@okhdfc" });
    expect(s.upiLink).toBe("upi://pay?pa=host%40okhdfc&pn=Host&am=20.00&cu=INR&tn=Contri%3A%20Pizza");
  });

  it("doesn't count the host twice, rounds up to the paisa, honours a manual headcount and the party's own UPI ID", () => {
    expect(defaultHeadcount({ organizerName: "Priya", organizerEmail: "priya@team.test", participants: five })).toBe(4);
    expect(roundUpToPaisa(100 / 3)).toBe(33.34);
    expect(roundUpToPaisa(20)).toBe(20);
    const s = computeContriSplit({ category: "contri", title: "x", organizerName: "H", participants: five, budget: 1000, contri: { splitCount: 8, upiId: "party@ybl" } }, "profile@okhdfc")!;
    expect(s).toMatchObject({ total: 1000, headcount: 8, perHead: 125, upiId: "party@ybl" });
  });

  it("no split for other categories or without an amount; no QR link without a UPI ID", () => {
    expect(computeContriSplit({ category: "monthly", title: "x", organizerName: "H", budget: 100 })).toBeNull();
    expect(computeContriSplit({ category: "contri", title: "x", organizerName: "H" })).toBeNull();
    expect(computeContriSplit({ category: "contri", title: "x", organizerName: "H", budget: 50 })?.upiLink).toBeNull();
    expect(upiPayLink({ upiId: "a@b", payeeName: "A B", amount: 12.5, note: "n" })).toContain("am=12.50");
  });

  it("rejects invalid UPI IDs", () => {
    expect(() => UpdateEventSchema.parse({ contri: { upiId: "not a upi" } })).toThrow();
    expect(UpdateEventSchema.parse({ contri: { upiId: "ravi.k@okhdfcbank" } }).contri?.upiId).toBe("ravi.k@okhdfcbank");
  });
});

describe("contri parties", () => {
  it("uses the host's profile UPI ID, and partial updates keep the other split fields", async () => {
    const sup = { id: await makeAdmin(), role: "super_admin" as const };
    await createUser(UserCreateSchema.parse({ email: "host@team.test", name: "Host", upiId: "host@okhdfc" }), sup);
    const e = await createEvent(contriEvent({ contri: { totalAmount: 100 } }), sup.id);
    expect(await getEventContriSplit(String(e._id), { admin: false })).toMatchObject({ perHead: 20, upiId: "host@okhdfc" });

    await updateEvent(String(e._id), UpdateEventSchema.parse({ contri: { splitCount: 4 } }), sup.id);
    const after = await PartyEvent.findById(e._id).lean();
    expect(after?.contri).toMatchObject({ totalAmount: 100, splitCount: 4 });
    expect(await getEventContriSplit(String(e._id), { admin: true })).toMatchObject({ perHead: 25 });
  });

  it("after approval everyone gets the funny 'thank yourselves' email with their share and a UPI QR; the host gets a host thanks", async () => {
    const send = vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x"], rejected: [], response: "250" });
    const adminId = await makeAdmin();
    await User.create({ email: "host@team.test", name: "Host", upiId: "host@okhdfc" });
    const e = await createEvent(contriEvent({ contri: { totalAmount: 100 } }), adminId);
    await ScheduledJob.deleteMany({});
    await setEventStatus(String(e._id), "completed", adminId);

    const outcomes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const job = await claimNextJob("w1", new Date(Date.now() + 10 * 60_000));
      if (!job) break;
      outcomes.push(`${job.jobType}:${(await processJob(job, "w1")).outcome}`);
    }
    expect(outcomes.sort()).toEqual(["party_giver_thanks:sent", "thank_you:sent"]);

    const all = send.mock.calls.map((c) => c[0]);
    const thanks = all.find((m) => m.subject.includes("Thank you... to yourself"))!;
    expect(thanks.to.sort()).toEqual(["arjun@team.test", "host@team.test", "neha@team.test", "priya@team.test", "ravi@team.test"]);
    expect(thanks.html).toContain("₹20");
    expect(thanks.html).toContain("cid:contri-upi-qr");
    expect(thanks.text).toContain("upi://pay?pa=host%40okhdfc");
    const qr = thanks.attachments?.[0];
    expect(qr?.contentType).toBe("image/png");
    expect(qr?.content.subarray(1, 4).toString()).toBe("PNG");

    const host = all.find((m) => m.to[0] === "host@team.test" && m !== thanks)!;
    expect(host.subject).toMatch(/^Re: /);
    expect(host.html).toContain("fronting the bill");
    expect(host.html).toContain("₹80"); // 4 people pay ₹20 back
  });

  it("without a UPI ID the email still goes out, with no QR", async () => {
    const send = vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x"], rejected: [], response: "250" });
    const adminId = await makeAdmin();
    const e = await createEvent(contriEvent({ budget: 500, organizerEmail: null }), adminId);
    await ScheduledJob.deleteMany({});
    await setEventStatus(String(e._id), "completed", adminId);
    const job = await claimNextJob("w1", new Date(Date.now() + 10 * 60_000));
    expect((await processJob(job!, "w1")).outcome).toBe("sent");
    const msg = send.mock.calls[0][0];
    expect(msg.html).toContain("hasn't added a UPI ID");
    expect(msg.attachments).toBeUndefined();
  });

  it("other categories keep the classic thank-you", async () => {
    const send = vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x"], rejected: [], response: "250" });
    const adminId = await makeAdmin();
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ budget: 100 })), adminId);
    await ScheduledJob.deleteMany({});
    await setEventStatus(String(e._id), "completed", adminId);
    const job = await claimNextJob("w1", new Date(Date.now() + 10 * 60_000));
    await processJob(job!, "w1");
    expect(send.mock.calls[0][0].subject).toBe("🎉 Thanks for the Treat!");
  });
});
