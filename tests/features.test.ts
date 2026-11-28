import { afterEach, describe, expect, it, vi } from "vitest";
import { PartyEvent, ScheduledJob, User } from "@/models";
import { claimNextJob } from "@/lib/scheduler";
import * as email from "@/lib/email";
import { atLocalHour, dayKey } from "@/lib/time";
import { ChangePasswordSchema, CreateEventSchema, UpdateEventSchema, UserCreateSchema, UserUpdateSchema } from "@/lib/validation";
import { login, validateSessionToken } from "@/services/auth.service";
import { changeOwnPassword, createUser, sendCredentials, updateUser } from "@/services/user.service";
import { createEvent, EVENT_NOTIFY_DELAY_MS, PARTY_DAY_HOUR, requestApproval, setEventStatus, updateEvent, type EventActor } from "@/services/event.service";
import { processJob } from "@/services/notification.service";
import { listUpcomingOccasions, nextOccurrence } from "@/services/occasion.service";
import { baseEvent, makeAdmin } from "./helpers";

const create = (v: unknown) => UserCreateSchema.parse(v);
const upd = (v: unknown) => UserUpdateSchema.parse(v);
const DAY = 24 * 3600 * 1000;

function spySend() {
  return vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });
}
afterEach(() => vi.restoreAllMocks());

async function superAdmin() {
  return { id: await makeAdmin(), role: "super_admin" as const };
}

/** Processes every job due by `at` and returns the messages that were sent. */
async function drain(at: Date) {
  const results: { type: string; outcome: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const job = await claimNextJob("w1", at);
    if (!job) break;
    results.push({ type: job.jobType, outcome: (await processJob(job, "w1")).outcome });
  }
  return results;
}

async function makeUser(sup: { id: string; role: "super_admin" }, email: string, name: string, role: "member" | "manager" | "admin" = "member"): Promise<EventActor> {
  const u = await createUser(create({ email, name, role }), sup);
  return { id: String(u._id), email, name, role };
}

describe("sign-in for every user + login details email", () => {
  it("a new user gets the welcome email, then their username and a one-time password", async () => {
    const send = spySend();
    const sup = await superAdmin();
    await createUser(create({ email: "neha@team.test", name: "Neha" }), sup);
    const results = await drain(new Date(Date.now() + 60_000));
    expect(results.map((r) => [r.type, r.outcome])).toEqual([
      ["user_welcome", "sent"],
      ["user_credentials", "sent"],
    ]);
    const msg = send.mock.calls[1][0];
    expect(msg.to).toEqual(["neha@team.test"]);
    expect(msg.text).toContain("Username: neha@team.test");
    const password = /One-time password: (\S+)/.exec(msg.text)![1];
    expect(password.length).toBeGreaterThanOrEqual(10);

    // Only a hash is stored, and the password works once; that session must change it.
    const stored = await User.findOne({ email: "neha@team.test" }).select("+passwordHash").lean();
    expect(stored?.passwordHash).not.toContain(password);
    expect(stored?.mustChangePassword).toBe(true);
    const { token, user } = await login({ email: "neha@team.test", password, ip: "4.4.4.1" });
    expect(user).toMatchObject({ role: "member", mustChangePassword: true });
    expect((await validateSessionToken(token))?.mustChangePassword).toBe(true);
    await expect(login({ email: "neha@team.test", password, ip: "4.4.4.2" })).rejects.toMatchObject({ status: 401, code: "TEMP_PASSWORD_USED" });

    const session = (await validateSessionToken(token))!;
    await changeOwnPassword(session, ChangePasswordSchema.parse({ newPassword: "My-own-password-1" }));
    expect((await validateSessionToken(token))?.mustChangePassword).toBe(false);
    await expect(login({ email: "neha@team.test", password: "My-own-password-1", ip: "4.4.4.3" })).resolves.toBeTruthy();
    await expect(login({ email: "neha@team.test", password: "My-own-password-1", ip: "4.4.4.4" })).resolves.toBeTruthy();
  });

  it("existing users without a password get login details in bulk; users who sign in are left alone", async () => {
    spySend();
    const sup = await superAdmin();
    // Existing users from before: no password, no queued credentials.
    await User.create([{ email: "old1@team.test", name: "Old One" }, { email: "old2@team.test", name: "Old Two" }]);
    await User.create({ email: "off@team.test", name: "Off", isActive: false });
    expect(await sendCredentials({ allWithoutPassword: true }, sup)).toEqual({ queued: 2 });
    await drain(new Date(Date.now() + 60_000));
    const users = await User.find({ email: /old/ }).select("+passwordHash").lean();
    expect(users.every((u) => u.passwordHash && u.mustChangePassword)).toBe(true);
    // Run again: nobody is left without a password.
    expect(await sendCredentials({ allWithoutPassword: true }, sup)).toEqual({ queued: 0 });
  });

  it("only the Super Admin sends login details or sets passwords", async () => {
    const sup = await superAdmin();
    const admin = await createUser(create({ email: "a@team.test", name: "A", role: "admin", password: "Admin-pass-123" }), sup);
    const actor = { id: String(admin._id), role: "admin" as const };
    const m = await createUser(create({ email: "m@team.test", name: "M" }), sup);
    await expect(sendCredentials({ userId: String(m._id) }, actor)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(String(m._id), upd({ password: "Another-pass-1" }), actor)).rejects.toMatchObject({ status: 403 });
    await expect(createUser(create({ email: "x@team.test", name: "X", password: "Another-pass-1" }), actor)).rejects.toMatchObject({ status: 403 });
  });

  it("a password set by the Super Admin is one-time and signs the user out", async () => {
    const sup = await superAdmin();
    const m = await createUser(create({ email: "m@team.test", name: "M" }), sup);
    await updateUser(String(m._id), upd({ password: "Temp-pass-12345" }), sup);
    const { token } = await login({ email: "m@team.test", password: "Temp-pass-12345", ip: "4.4.5.1" });
    await updateUser(String(m._id), upd({ password: "Temp-pass-67890" }), sup);
    expect(await validateSessionToken(token)).toBeNull();
    await login({ email: "m@team.test", password: "Temp-pass-67890", ip: "4.4.5.2" });
    await expect(login({ email: "m@team.test", password: "Temp-pass-67890", ip: "4.4.5.3" })).rejects.toMatchObject({ code: "TEMP_PASSWORD_USED" });
  });
});

describe("role upgrade email", () => {
  it("is sent on promotion only, never on demotion", async () => {
    const send = spySend();
    const sup = await superAdmin();
    const m = await createUser(create({ email: "m@team.test", name: "Mira" }), sup);
    await ScheduledJob.deleteMany({});
    await updateUser(String(m._id), upd({ role: "manager" }), sup);
    await updateUser(String(m._id), upd({ role: "member" }), sup);
    const jobs = await ScheduledJob.find({ jobType: "user_role_upgrade" }).lean();
    expect(jobs).toHaveLength(1);
    // Demoted before it went out: skipped.
    expect((await drain(new Date())).find((r) => r.type === "user_role_upgrade")?.outcome).toBe("skipped");

    await updateUser(String(m._id), upd({ role: "admin" }), sup);
    const results = await drain(new Date(Date.now() + 60_000));
    expect(results.find((r) => r.type === "user_role_upgrade")?.outcome).toBe("sent");
    const msg = send.mock.calls.find((c) => c[0].subject.includes("promoted"))![0];
    expect(msg.to).toEqual(["m@team.test"]);
  });
});

describe("parties by role", () => {
  it("members add only their own parties and can't approve them", async () => {
    const sup = await superAdmin();
    const ravi = await makeUser(sup, "ravi@team.test", "Ravi");
    await expect(createEvent(CreateEventSchema.parse(baseEvent({ organizerEmail: "priya@team.test" })), ravi.id, ravi)).rejects.toMatchObject({ status: 403 });
    await expect(createEvent(CreateEventSchema.parse(baseEvent({ status: "completed" })), ravi.id, ravi)).rejects.toMatchObject({ status: 403 });
    const own = await createEvent(CreateEventSchema.parse(baseEvent({ organizerName: "Ravi" })), ravi.id, ravi);
    expect(own.organizerEmail).toBe("ravi@team.test"); // forced to themselves
    await expect(setEventStatus(String(own._id), "completed", ravi.id, ravi)).rejects.toMatchObject({ status: 403 });
    await expect(updateEvent(String(own._id), UpdateEventSchema.parse({ location: "Roof" }), ravi.id, ravi)).resolves.toMatchObject({ location: "Roof" });

    const other = await createEvent(CreateEventSchema.parse(baseEvent({ organizerEmail: "boss@party.test" })), sup.id);
    await expect(updateEvent(String(other._id), UpdateEventSchema.parse({ location: "X" }), ravi.id, ravi)).rejects.toMatchObject({ status: 403 });
  });

  it("managers schedule and modify anyone's party, but approving stays with admins", async () => {
    const sup = await superAdmin();
    const mona = await makeUser(sup, "mona@team.test", "Mona", "manager");
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ organizerName: "Priya", organizerEmail: "priya@team.test" })), mona.id, mona);
    expect(e.organizerEmail).toBe("priya@team.test");
    await expect(updateEvent(String(e._id), UpdateEventSchema.parse({ organizerName: "Ravi", organizerEmail: "ravi@team.test" }), mona.id, mona)).resolves.toMatchObject({ organizerName: "Ravi" });
    await expect(setEventStatus(String(e._id), "completed", mona.id, mona)).rejects.toMatchObject({ status: 403 });
    await expect(setEventStatus(String(e._id), "cancelled", mona.id, mona)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("the giver can request approval once the party day has come", async () => {
    const send = spySend();
    const sup = await superAdmin();
    const ravi = await makeUser(sup, "ravi@team.test", "Ravi");
    const future = await createEvent(CreateEventSchema.parse(baseEvent()), ravi.id, ravi);
    await expect(requestApproval(String(future._id), ravi)).rejects.toMatchObject({ status: 400 });

    const today = dayKey(new Date());
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ eventDate: today })), ravi.id, ravi);
    const priya = await makeUser(sup, "priya@team.test", "Priya");
    await expect(requestApproval(String(e._id), priya)).rejects.toMatchObject({ status: 403 });
    await requestApproval(String(e._id), ravi);
    await expect(requestApproval(String(e._id), ravi)).rejects.toMatchObject({ status: 409 }); // no spamming
    expect((await PartyEvent.findById(e._id).lean())?.approvalRequestedByEmail).toBe("ravi@team.test");

    await ScheduledJob.deleteMany({ jobType: { $ne: "party_approval_request" } });
    expect(await drain(new Date())).toEqual([{ type: "party_approval_request", outcome: "sent" }]);
    expect(send.mock.calls[0][0].to).toEqual(["boss@party.test"]);
  });
});

describe("parties are scheduled by day", () => {
  it("a date-only value is stored at noon in the team's timezone", async () => {
    const actor = await makeAdmin();
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ eventDate: "2030-05-17" })), actor);
    expect(new Date(e.eventDate).getTime()).toBe(atLocalHour("2030-05-17", PARTY_DAY_HOUR).getTime());
    const after = await updateEvent(String(e._id), UpdateEventSchema.parse({ eventDate: "2030-05-18" }), actor);
    expect(dayKey(after.eventDate)).toBe("2030-05-18");
  });
});

describe("party added / changed emails (1 minute later, to participants)", () => {
  const participants = [
    { name: "Priya", email: "priya@team.test" },
    { name: "Ravi", email: "ravi@team.test" },
  ];

  it("one email a minute after adding, with the latest details, to participants and the giver", async () => {
    const send = spySend();
    const actor = await makeAdmin();
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ participants, organizerEmail: "giver@team.test" })), actor);
    const job = await ScheduledJob.findOne({ jobType: "event_scheduled" }).lean();
    expect(new Date(job!.scheduledAt).getTime() - Date.now()).toBeGreaterThan(EVENT_NOTIFY_DELAY_MS - 5_000);
    expect(await drain(new Date())).toEqual([]); // not before the minute is up

    // Changing the date and giver inside the minute doesn't queue a second email...
    await updateEvent(String(e._id), UpdateEventSchema.parse({ eventDate: new Date(Date.now() + 9 * DAY), organizerName: "Neha" }), actor);
    expect(await ScheduledJob.countDocuments({ jobType: "event_update" })).toBe(0);
    // ...the one email renders the final state.
    expect(await drain(new Date(Date.now() + 2 * EVENT_NOTIFY_DELAY_MS))).toEqual([{ type: "event_scheduled", outcome: "sent" }]);
    const msg = send.mock.calls[0][0];
    expect(msg.to.sort()).toEqual(["giver@team.test", "priya@team.test", "ravi@team.test"]);
    expect(msg.html).toContain("Neha");
  });

  it("a change that is undone within the minute sends nothing", async () => {
    const send = spySend();
    const actor = await makeAdmin();
    const original = new Date(Date.now() + 3 * DAY);
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ participants, eventDate: original })), actor);
    await drain(new Date(Date.now() + 2 * EVENT_NOTIFY_DELAY_MS));
    send.mockClear();
    await updateEvent(String(e._id), UpdateEventSchema.parse({ eventDate: new Date(Date.now() + 4 * DAY) }), actor);
    await updateEvent(String(e._id), UpdateEventSchema.parse({ eventDate: original }), actor);
    expect(await drain(new Date(Date.now() + 2 * EVENT_NOTIFY_DELAY_MS))).toEqual([{ type: "event_update", outcome: "skipped" }]);
    expect(send).not.toHaveBeenCalled();
  });

  it("cancelling before the announcement went out sends neither email", async () => {
    const send = spySend();
    const actor = await makeAdmin();
    const e = await createEvent(CreateEventSchema.parse(baseEvent({ participants })), actor);
    await setEventStatus(String(e._id), "cancelled", actor);
    await drain(new Date(Date.now() + 2 * EVENT_NOTIFY_DELAY_MS));
    expect(send).not.toHaveBeenCalled();
  });
});

describe("occasions", () => {
  it("finds the next yearly occurrence, including today and 29 February", () => {
    expect(nextOccurrence(atLocalHour("1990-03-10", 0), "2026-03-10")).toEqual({ nextDay: "2026-03-10", daysAway: 0, years: 36 });
    expect(nextOccurrence(atLocalHour("1990-03-09", 0), "2026-03-10")).toMatchObject({ nextDay: "2027-03-09", years: 37 });
    expect(nextOccurrence(atLocalHour("2000-02-29", 0), "2026-02-01")).toMatchObject({ nextDay: "2026-02-28", daysAway: 27 });
  });

  it("lists birthdays, work anniversaries and relatives' events within the range", async () => {
    const sup = await superAdmin();
    const now = atLocalHour("2026-06-01", 10);
    await createUser(
      create({
        email: "ravi@team.test",
        name: "Ravi",
        birthday: atLocalHour("1992-06-05", 0),
        joinedOn: atLocalHour("2020-12-01", 0),
        occasions: [
          { personName: "Anita", relation: "Spouse", occasion: "Anniversary", date: atLocalHour("2018-06-20", 0) },
          { personName: "Kabir", relation: "Son", occasion: "Birthday", date: atLocalHour("2019-09-01", 0) },
        ],
      }),
      sup
    );
    const list = await listUpcomingOccasions({ days: 30, now });
    expect(list.map((o) => [o.personName, o.occasion, o.daysAway, o.years])).toEqual([
      ["Ravi", "Birthday", 4, 34],
      ["Anita", "Anniversary", 19, 8],
    ]);
  });
});
