import { describe, expect, it, vi } from "vitest";
import { ScheduledJob } from "@/models";
import { claimNextJob } from "@/lib/scheduler";
import { CreateEventSchema, UserCreateSchema } from "@/lib/validation";
import { atLocalHour, dayKey } from "@/lib/time";
import { messageIdFor } from "@/lib/email";
import * as email from "@/lib/email";
import { createEvent, setEventStatus, updateEvent } from "@/services/event.service";
import { createUser } from "@/services/user.service";
import { enqueuePartyDayNotifications, partyDayKeys, processJob } from "@/services/notification.service";
import { getSettings } from "@/services/settings.service";
import { baseEvent, makeAdmin } from "./helpers";

const today = dayKey(new Date());
const NINE_AM = atLocalHour(today, 9);
const EARLY = atLocalHour(today, 7);

async function setup(overrides: Record<string, unknown> = {}) {
  const adminId = await makeAdmin(); // Super Admin: boss@party.test
  const actor = { id: adminId, role: "super_admin" as const };
  await createUser(UserCreateSchema.parse({ email: "priya@team.test", name: "Priya" }), actor);
  await createUser(UserCreateSchema.parse({ email: "ravi@team.test", name: "Ravi" }), actor);
  await createUser(UserCreateSchema.parse({ email: "gone@team.test", name: "Gone", isActive: false }), actor);
  // These tests are about party-day emails; drop the welcome emails the new users triggered.
  await ScheduledJob.deleteMany({ jobType: "user_welcome" });
  const event = await createEvent(
    CreateEventSchema.parse(baseEvent({ organizerName: "Ravi", organizerEmail: "ravi@team.test", eventDate: atLocalHour(today, 18), ...overrides })),
    adminId
  );
  return { adminId, id: String(event._id) };
}

function spySend() {
  return vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });
}

/** Claims and processes the next due job (as of `at`). */
async function runNext(at: Date) {
  const job = await claimNextJob("w1", at);
  expect(job).not.toBeNull();
  return { job: job!, result: await processJob(job!, "w1") };
}

describe("party-day emails (9 AM, team timezone)", () => {
  it("queues the members, giver and Super Admin emails for 9 AM, once", async () => {
    const { id } = await setup();
    expect(await enqueuePartyDayNotifications(await getSettings(), EARLY)).toBe(3);
    expect(await enqueuePartyDayNotifications(await getSettings(), EARLY)).toBe(0); // idempotent
    const jobs = await ScheduledJob.find({ eventId: id }).sort({ scheduledAt: 1 }).lean();
    expect(jobs.map((j) => j.jobType).sort()).toEqual(["party_approval_request", "party_day", "party_giver_notice"]);
    const day = jobs.find((j) => j.jobType === "party_day")!;
    expect(new Date(day.scheduledAt).getTime()).toBe(NINE_AM.getTime());
    expect(await claimNextJob("w1", new Date(NINE_AM.getTime() - 1000))).toBeNull(); // not before 9
  });

  it("does nothing for parties on other days", async () => {
    await setup({ eventDate: new Date(atLocalHour(today, 18).getTime() + 2 * 86400_000) });
    expect(await enqueuePartyDayNotifications(await getSettings(), EARLY)).toBe(0);
  });

  it("sends 'party today' to active members, and a threaded pair to the giver and Super Admin", async () => {
    const send = spySend();
    const { id } = await setup();
    await enqueuePartyDayNotifications(await getSettings(), EARLY);
    const after9 = new Date(NINE_AM.getTime() + 5000);
    for (let i = 0; i < 3; i++) expect((await runNext(after9)).result.outcome).toBe("sent");
    const calls = send.mock.calls.map((c) => c[0]);
    const byKey = (k: string) => calls.find((c) => c.idempotencyKey === k)!;
    const keys = partyDayKeys(id, today);

    const members = byKey(keys.members);
    // Every active user, including the Super Admin; the inactive user is excluded.
    expect(members.to.sort()).toEqual(["boss@party.test", "priya@team.test", "ravi@team.test"]);
    expect(members.subject).toContain("Party today");

    const giver = byKey(keys.giver);
    const approval = byKey(keys.approval);
    expect(giver.to).toEqual(["ravi@team.test"]);
    expect(approval.to).toEqual(["boss@party.test"]);
    // Same subject (with the date) + reply headers = one thread.
    expect(giver.subject).toBe(approval.subject);
    expect(giver.subject).toMatch(/Party confirmation: Monthly Pizza — \d{1,2} \w{3} \d{4}/);
    const root = messageIdFor(keys.giver);
    expect(giver.thread?.messageId).toBe(root);
    expect(approval.thread?.inReplyTo).toBe(root);
    send.mockRestore();
  });

  it("approval completes the party and thanks the giver in the same thread, copying the Super Admin", async () => {
    const send = spySend();
    const { adminId, id } = await setup();
    await enqueuePartyDayNotifications(await getSettings(), EARLY);
    const after9 = new Date(NINE_AM.getTime() + 5000);
    for (let i = 0; i < 3; i++) await runNext(after9);
    const threadSubject = send.mock.calls[0][0].subject.includes("confirmation")
      ? send.mock.calls[0][0].subject
      : send.mock.calls.find((c) => c[0].subject.includes("confirmation"))![0].subject;

    const approved = await setEventStatus(id, "completed", adminId);
    expect(approved.status).toBe("completed");
    expect(approved.approvedByEmail).toBe("boss@party.test");
    expect(approved.approvedAt).toBeTruthy();

    const { job, result } = await runNext(new Date(Date.now() + 1000));
    expect(job.jobType).toBe("party_giver_thanks");
    expect(result.outcome).toBe("sent");
    const thanks = send.mock.calls.at(-1)![0];
    expect(thanks.to).toEqual(["ravi@team.test"]);
    expect(thanks.cc).toEqual(["boss@party.test"]);
    expect(thanks.subject).toBe(`Re: ${threadSubject}`);
    expect(thanks.thread?.inReplyTo).toBe(messageIdFor(partyDayKeys(id, today).giver));
    send.mockRestore();
  });

  it("skips queued party-day emails if the party moves to another day or is approved early", async () => {
    const send = spySend();
    // No "event updated" email, so only the party-day jobs are in the queue.
    const { adminId, id } = await setup({ notificationPreferences: { updates: false } });
    await enqueuePartyDayNotifications(await getSettings(), EARLY);
    await updateEvent(id, { eventDate: new Date(atLocalHour(today, 18).getTime() + 86400_000) }, adminId);
    const after9 = new Date(NINE_AM.getTime() + 5000);
    expect((await runNext(after9)).result.outcome).toBe("skipped");
    // Approving cancels whatever is still pending.
    await setEventStatus(id, "completed", adminId);
    expect(await ScheduledJob.countDocuments({ eventId: id, jobType: { $in: ["party_day", "party_giver_notice", "party_approval_request"] }, status: "pending" })).toBe(0);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("instant parties skip the members email (already announced) but still need approval", async () => {
    const { id } = await setup({ eventType: "instant" });
    await enqueuePartyDayNotifications(await getSettings(), EARLY);
    const types = (await ScheduledJob.find({ eventId: id, jobType: { $ne: "instant_announcement" } }).lean()).map((j) => j.jobType).sort();
    expect(types).toEqual(["party_approval_request", "party_giver_notice"]);
  });
});
