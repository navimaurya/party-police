import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordResetToken, ScheduledJob, Session, User } from "@/models";
import { claimNextJob } from "@/lib/scheduler";
import * as email from "@/lib/email";
import { meetsPasswordPolicy, passwordProblems, passwordStrength } from "@/lib/password-policy";
import { atLocalHour, dayKey } from "@/lib/time";
import { ChangePasswordSchema, ResetPasswordSchema, UserCreateSchema, UserUpdateSchema } from "@/lib/validation";
import { login, validateSessionToken } from "@/services/auth.service";
import { changeOwnPassword, checkPasswordResetToken, requestPasswordReset, resetPasswordWithToken } from "@/services/password.service";
import { enqueueOccasionNotifications, processJob } from "@/services/notification.service";
import { getSettings } from "@/services/settings.service";
import { createUser, updateUser } from "@/services/user.service";
import { makeAdmin } from "./helpers";

afterEach(() => vi.restoreAllMocks());
const spySend = () => vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });
const sup = async () => ({ id: await makeAdmin(), role: "super_admin" as const });

async function drain(at = new Date(Date.now() + 60_000)) {
  const out: { type: string; outcome: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const job = await claimNextJob("w1", at);
    if (!job) break;
    out.push({ type: job.jobType, outcome: (await processJob(job, "w1")).outcome });
  }
  return out;
}
const sentTo = (send: ReturnType<typeof spySend>) => send.mock.calls.map((c) => c[0] as { to: string[]; subject: string; text: string });

describe("password policy", () => {
  it("needs 6+ characters with a capital, a small letter, a number and a special character", () => {
    expect(meetsPasswordPolicy("Ab1!xy")).toBe(true);
    expect(passwordProblems("abc").map((r) => r.id)).toEqual(["length", "upper", "number", "special"]);
    expect(meetsPasswordPolicy("Abcdef1")).toBe(false); // no special
    expect(meetsPasswordPolicy("ABCDE1!")).toBe(false); // no small letter
    expect(() => UserUpdateSchema.parse({ password: "weakpassword" })).toThrow(/capital letter/);
    expect(() => ChangePasswordSchema.parse({ newPassword: "Ab1!" })).toThrow(/6 characters/);
  });

  it("rates strength: too weak < fair (meets policy) < strong; common words drag it down", () => {
    expect(passwordStrength("").label).toBe("Too weak");
    expect(passwordStrength("abc").score).toBe(0);
    expect(passwordStrength("Ab1!xy").label).toBe("Fair");
    expect(passwordStrength("Tr0ub4dor&3-Horse!").label).toBe("Strong");
    expect(passwordStrength("Password1!").score).toBeLessThan(passwordStrength("Kq7#mZ2!vL").score);
  });
});

describe("one-time password", () => {
  it("after signing in with it, only the new password is asked; everyone else still needs the current one", async () => {
    const s = await sup();
    const m = await createUser(UserCreateSchema.parse({ email: "m@team.test", name: "M" }), s);
    await updateUser(String(m._id), UserUpdateSchema.parse({ password: "Temp-pass-1" }), s);
    const { token } = await login({ email: "m@team.test", password: "Temp-pass-1", ip: "5.5.5.1" });
    const session = (await validateSessionToken(token))!;
    await changeOwnPassword(session, ChangePasswordSchema.parse({ newPassword: "Mine-pass-2" }));
    expect((await validateSessionToken(token))?.mustChangePassword).toBe(false);

    // Now a normal account: the current password is required again.
    await expect(changeOwnPassword(session, ChangePasswordSchema.parse({ newPassword: "Other-pass-3" }))).rejects.toMatchObject({ status: 400 });
    await expect(changeOwnPassword(session, ChangePasswordSchema.parse({ currentPassword: "nope", newPassword: "Other-pass-3" }))).rejects.toMatchObject({ status: 400 });
    await changeOwnPassword(session, ChangePasswordSchema.parse({ currentPassword: "Mine-pass-2", newPassword: "Other-pass-3" }));
    await expect(login({ email: "m@team.test", password: "Other-pass-3", ip: "5.5.5.2" })).resolves.toBeTruthy();
  });
});

describe("forgot password", () => {
  it("emails a one-use, 30-minute link (made at send time, stored only as a hash) that signs out every session", async () => {
    const send = spySend();
    const s = await sup();
    await createUser(UserCreateSchema.parse({ email: "neha@team.test", name: "Neha Rao", password: "Start-pass-1" }), s);
    await User.updateOne({ email: "neha@team.test" }, { $set: { mustChangePassword: false } });
    const { token: session } = await login({ email: "neha@team.test", password: "Start-pass-1", ip: "6.6.6.1" });
    await ScheduledJob.deleteMany({}); // the welcome email isn't part of this

    await requestPasswordReset("NEHA@team.test", "6.6.6.1");
    await requestPasswordReset("ghost@team.test", "6.6.6.1"); // unknown: silently nothing
    expect(await ScheduledJob.countDocuments({ jobType: "password_reset" })).toBe(1);
    expect(await drain()).toEqual([{ type: "password_reset", outcome: "sent" }]);

    const msg = sentTo(send).find((m) => m.subject.includes("Reset"))!;
    expect(msg.to).toEqual(["neha@team.test"]);
    const link = /(http\S+reset-password\?token=\S+)/.exec(msg.text)![1];
    const token = decodeURIComponent(new URL(link).searchParams.get("token")!);
    const stored = await PasswordResetToken.findOne({}).lean();
    expect(stored!.tokenHash).not.toContain(token);
    expect(stored!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(stored!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(await checkPasswordResetToken(token)).toMatchObject({ email: "neha@team.test" });

    await expect(resetPasswordWithToken(ResetPasswordSchema.parse({ token, newPassword: "Fresh-pass-9" }))).resolves.toMatchObject({ email: "neha@team.test" });
    expect(await validateSessionToken(session)).toBeNull();
    expect(await Session.countDocuments({})).toBe(0);
    await expect(login({ email: "neha@team.test", password: "Fresh-pass-9", ip: "6.6.6.2" })).resolves.toBeTruthy();
    // Used once: no second time.
    await expect(resetPasswordWithToken(ResetPasswordSchema.parse({ token, newPassword: "Again-pass-9" }))).rejects.toMatchObject({ status: 400 });
    expect(await checkPasswordResetToken(token)).toBeNull();
  });

  it("expired links don't work; a newer link replaces an older one; at most 3 emails per 15 minutes", async () => {
    spySend();
    const s = await sup();
    await createUser(UserCreateSchema.parse({ email: "a@team.test", name: "A" }), s);
    await ScheduledJob.deleteMany({});
    for (let i = 0; i < 5; i++) await requestPasswordReset("a@team.test", `7.7.7.${i}`);
    expect(await drain()).toHaveLength(3); // 3 emails per 15 minutes, then silence
    expect(await PasswordResetToken.countDocuments({})).toBe(1); // each new link replaced the previous one

    const { userId } = (await PasswordResetToken.findOne({}).lean())!;
    const { issuePasswordResetToken } = await import("@/services/password.service");
    const token = await issuePasswordResetToken(userId);
    await PasswordResetToken.updateOne({ userId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPasswordWithToken(ResetPasswordSchema.parse({ token, newPassword: "Late-pass-1" }))).rejects.toMatchObject({ status: 400 });
  });

  it("is sent even when notifications are switched off", async () => {
    spySend();
    const s = await sup();
    await createUser(UserCreateSchema.parse({ email: "a@team.test", name: "A" }), s);
    const settings = await getSettings();
    const { AppSettings } = await import("@/models");
    await AppSettings.updateOne({ _id: settings._id }, { $set: { notificationEnabled: false } });
    await ScheduledJob.deleteMany({});
    await requestPasswordReset("a@team.test", "8.8.8.8");
    expect(await drain()).toEqual([{ type: "password_reset", outcome: "sent" }]);
  });
});

describe("special-day emails", () => {
  it("wishes the person and reminds everyone else, once per occasion per day", async () => {
    const send = spySend();
    await makeAdmin();
    const now = new Date();
    const thisDayYearsAgo = (y: number) => atLocalHour(`${Number(dayKey(now).slice(0, 4)) - y}${dayKey(now).slice(4)}`, 12);
    await User.create([
      { email: "priya@team.test", name: "Priya Shah", birthday: thisDayYearsAgo(30) },
      { email: "ravi@team.test", name: "Ravi Kumar", joinedOn: thisDayYearsAgo(5), occasions: [{ personName: "Anya", relation: "Daughter", occasion: "Birthday", date: thisDayYearsAgo(6) }] },
      { email: "neha@team.test", name: "Neha Rao" },
      { email: "gone@team.test", name: "Gone", birthday: thisDayYearsAgo(40), isActive: false },
    ]);
    const settings = await getSettings();
    expect(await enqueueOccasionNotifications(settings, now)).toBe(6); // 3 occasions x (wish + reminder)
    expect(await enqueueOccasionNotifications(settings, now)).toBe(0);
    await drain(new Date(atLocalHour(dayKey(now), 23).getTime()));

    const msgs = sentTo(send);
    const wishPriya = msgs.find((m) => m.to.length === 1 && m.to[0] === "priya@team.test")!;
    expect(wishPriya.subject).toContain("Happy birthday, Priya");
    expect(wishPriya.text).not.toContain("30"); // ages stay private
    const remindPriya = msgs.find((m) => m.subject.includes("Priya Shah's birthday"))!;
    expect(remindPriya.to).not.toContain("priya@team.test");
    expect(remindPriya.to).toEqual(expect.arrayContaining(["ravi@team.test", "neha@team.test"]));
    expect(msgs.some((m) => m.subject.includes("5th work anniversary"))).toBe(true);
    expect(msgs.some((m) => m.subject.includes("Anya") && m.to.includes("ravi@team.test"))).toBe(true);
    expect(msgs.some((m) => m.to.includes("gone@team.test") && m.to.length === 1)).toBe(false);
  });
});
