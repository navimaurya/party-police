import { describe, expect, it } from "vitest";
import { Session, User } from "@/models";
import { ChangePasswordSchema, UserCreateSchema, UserUpdateSchema } from "@/lib/validation";
import { login, upsertAdminFromEnv, validateSessionToken } from "@/services/auth.service";
import { changeOwnPassword, createUser, deleteUser, listActiveUsers, updateUser } from "@/services/user.service";
import { resetEnvCache } from "@/config/env";
import { makeAdmin } from "./helpers";

const create = (v: unknown) => UserCreateSchema.parse(v);
const upd = (v: unknown) => UserUpdateSchema.parse(v);

async function superAdmin() {
  return { id: await makeAdmin(), role: "super_admin" as const };
}
async function adminActor(sup: { id: string; role: "super_admin" }) {
  const a = await createUser(create({ email: "admin@team.test", name: "Ada Admin", role: "admin", password: "admin-pass-123" }), sup);
  return { id: String(a._id), role: "admin" as const };
}

describe("users: one collection for everyone", () => {
  it("stores the Super Admin, admins and members together; all are party members", async () => {
    const sup = await superAdmin();
    await adminActor(sup);
    await createUser(create({ email: "Priya@Team.test", name: "Priya" }), sup);
    expect(await User.countDocuments()).toBe(3);
    const active = (await listActiveUsers()).map((u) => u.email).sort();
    expect(active).toEqual(["admin@team.test", "boss@party.test", "priya@team.test"]);
  });

  it("email is the unique key and can't be changed", async () => {
    const sup = await superAdmin();
    await createUser(create({ email: "priya@team.test", name: "Priya" }), sup);
    await expect(createUser(create({ email: "PRIYA@team.test", name: "Other" }), sup)).rejects.toMatchObject({ status: 409 });
    expect(() => upd({ email: "new@team.test" })).toThrow();
  });

  it("there is only one Super Admin and it can't be created through the app", async () => {
    await superAdmin();
    expect(() => create({ email: "x@team.test", name: "X", role: "super_admin" })).toThrow();
    await expect(User.create({ email: "y@team.test", name: "Y", role: "super_admin" })).rejects.toMatchObject({ code: 11000 });
  });

  it("users without a password can't sign in yet; admins can", async () => {
    const sup = await superAdmin();
    await createUser(create({ email: "m@team.test", name: "M" }), sup);
    await expect(login({ email: "m@team.test", password: "anything-at-all", ip: "3.3.3.1" })).rejects.toMatchObject({ status: 401 });
    await adminActor(sup);
    const { token } = await login({ email: "admin@team.test", password: "admin-pass-123", ip: "3.3.3.2" });
    expect((await validateSessionToken(token))?.role).toBe("admin");
    expect((await User.findOne({ email: "admin@team.test" }).lean())?.lastLoginAt).toBeTruthy();
  });
});

describe("users: protection rules", () => {
  it("the Super Admin can't be deleted, deactivated or demoted", async () => {
    const sup = await superAdmin();
    const admin = await adminActor(sup);
    await expect(deleteUser(sup.id, sup)).rejects.toMatchObject({ status: 403 });
    await expect(deleteUser(sup.id, admin)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(sup.id, upd({ isActive: false }), sup)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(sup.id, upd({ role: "member" }), sup)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(sup.id, upd({ name: "Hacked" }), admin)).rejects.toMatchObject({ status: 403 });
    await expect(updateUser(sup.id, upd({ name: "The Boss" }), sup)).resolves.toMatchObject({ name: "The Boss" });
  });

  it("admins can't be deleted; the Super Admin must change them to member first", async () => {
    const sup = await superAdmin();
    const admin = await adminActor(sup);
    await expect(deleteUser(admin.id, sup)).rejects.toMatchObject({ status: 403 });
    await updateUser(admin.id, upd({ role: "member" }), sup);
    await expect(deleteUser(admin.id, sup)).resolves.toBeUndefined();
  });

  it("only the Super Admin manages admins; admins manage members", async () => {
    const sup = await superAdmin();
    const admin = await adminActor(sup);
    await expect(createUser(create({ email: "b@team.test", name: "B", role: "admin", password: "admin-pass-123" }), admin)).rejects.toMatchObject({ status: 403 });
    const other = await createUser(create({ email: "c@team.test", name: "C", role: "admin", password: "admin-pass-123" }), sup);
    await expect(updateUser(String(other._id), upd({ name: "X" }), admin)).rejects.toMatchObject({ status: 403 });
    const member = await createUser(create({ email: "d@team.test", name: "D" }), admin);
    await expect(updateUser(String(member._id), upd({ name: "Dee" }), admin)).resolves.toMatchObject({ name: "Dee" });
    await expect(updateUser(String(member._id), upd({ role: "admin", password: "admin-pass-123" }), admin)).rejects.toMatchObject({ status: 403 });
    await expect(deleteUser(String(member._id), admin)).resolves.toBeUndefined();
  });

  it("demoting or deactivating an admin signs them out; as a member they can still sign in", async () => {
    const sup = await superAdmin();
    const admin = await adminActor(sup);
    const { token } = await login({ email: "admin@team.test", password: "admin-pass-123", ip: "3.3.3.3" });
    await updateUser(admin.id, upd({ isActive: false }), sup);
    expect(await validateSessionToken(token)).toBeNull();
    await updateUser(admin.id, upd({ isActive: true, role: "member" }), sup);
    // Members sign in too now, so the password is kept.
    expect((await User.findById(admin.id).select("+passwordHash").lean())?.passwordHash).toBeTruthy();
    // Promoting again doesn't need a password; the Super Admin can still set a one-time one.
    await expect(updateUser(admin.id, upd({ role: "admin" }), sup)).resolves.toMatchObject({ role: "admin" });
    await updateUser(admin.id, upd({ password: "brand-new-pass-1" }), sup);
    await expect(login({ email: "admin@team.test", password: "brand-new-pass-1", ip: "3.3.3.4" })).resolves.toBeTruthy();
  });

  it("changing your own password checks the current one and signs out other sessions", async () => {
    const sup = await superAdmin();
    const a = await login({ email: "boss@party.test", password: "super-secret-pass", ip: "3.3.3.5" });
    const b = await login({ email: "boss@party.test", password: "super-secret-pass", ip: "3.3.3.6" });
    const current = await validateSessionToken(a.token);
    await expect(
      changeOwnPassword({ ...sup, sessionId: current!.sessionId }, ChangePasswordSchema.parse({ currentPassword: "wrong-password", newPassword: "next-pass-12345" }))
    ).rejects.toMatchObject({ status: 400 });
    await changeOwnPassword({ ...sup, sessionId: current!.sessionId }, ChangePasswordSchema.parse({ currentPassword: "super-secret-pass", newPassword: "next-pass-12345" }));
    expect(await validateSessionToken(a.token)).not.toBeNull(); // this device stays signed in
    expect(await validateSessionToken(b.token)).toBeNull();
    expect(await Session.countDocuments()).toBe(1);
  });
});

describe("Super Admin from env", () => {
  it("creates it, then moves it when ADMIN_EMAIL changes (never two Super Admins)", async () => {
    process.env.ADMIN_EMAIL = "first@team.test";
    resetEnvCache();
    await upsertAdminFromEnv();
    const first = await User.findOne({ role: "super_admin" }).lean();
    expect(first?.email).toBe("first@team.test");
    process.env.ADMIN_EMAIL = "second@team.test";
    resetEnvCache();
    await upsertAdminFromEnv();
    const supers = await User.find({ role: "super_admin" }).lean();
    expect(supers).toHaveLength(1);
    expect(String(supers[0]._id)).toBe(String(first?._id));
    expect(supers[0].email).toBe("second@team.test");
    process.env.ADMIN_EMAIL = "boss@party.test";
    resetEnvCache();
  });
});

describe("welcome email", () => {
  it("queues one welcome email for a new active user and sends it to them", async () => {
    const { ScheduledJob } = await import("@/models");
    const { claimNextJob } = await import("@/lib/scheduler");
    const { processJob } = await import("@/services/notification.service");
    const email = await import("@/lib/email");
    const { vi } = await import("vitest");
    const send = vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });

    const sup = await superAdmin();
    const u = await createUser(create({ email: "newbie@team.test", name: "Neha Sharma" }), sup);
    const jobs = await ScheduledJob.find({ jobType: "user_welcome" }).lean();
    expect(jobs).toHaveLength(1);
    expect(String(jobs[0].userId)).toBe(String(u._id));

    const job = await claimNextJob("w1", new Date(Date.now() + 1000));
    expect((await processJob(job!, "w1")).outcome).toBe("sent");
    const msg = send.mock.calls[0][0];
    expect(msg.to).toEqual(["newbie@team.test"]);
    expect(msg.subject).toContain("Welcome to the Party Police, Neha");
    expect(msg.html).toContain("you owe everyone a party");
    expect(msg.html).toContain("/parties"); // members get the parties link, not the sign-in page
    send.mockRestore();
  });

  it("admins get the sign-in link but never their password; inactive users get nothing", async () => {
    const { ScheduledJob } = await import("@/models");
    const { claimNextJob } = await import("@/lib/scheduler");
    const { processJob } = await import("@/services/notification.service");
    const email = await import("@/lib/email");
    const { vi } = await import("vitest");
    const send = vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });

    const sup = await superAdmin();
    await createUser(create({ email: "off@team.test", name: "Off", isActive: false }), sup);
    expect(await ScheduledJob.countDocuments({ jobType: "user_welcome" })).toBe(0);

    await createUser(create({ email: "officer@team.test", name: "Officer", role: "admin", password: "secret-admin-pass" }), sup);
    const job = await claimNextJob("w1", new Date(Date.now() + 1000));
    expect((await processJob(job!, "w1")).outcome).toBe("sent");
    const msg = send.mock.calls[0][0];
    expect(msg.html).toContain("/admin/login");
    expect(msg.html).not.toContain("secret-admin-pass");
    expect(msg.text).not.toContain("secret-admin-pass");
    send.mockRestore();
  });
});

describe("email delivery details", () => {
  it("uses the sender's real domain in Message-IDs (a fake domain is a spam signal)", async () => {
    const { messageIdFor } = await import("@/lib/email");
    expect(messageIdFor("user_welcome:abc")).toBe("<user.welcome.abc@test.local>"); // SMTP_FROM in tests is party@test.local
  });
});

describe("welcome email delivery problems", () => {
  it("a mail-server connection failure is retried later with a fresh connection", async () => {
    const { ScheduledJob, NotificationLog } = await import("@/models");
    const { claimNextJob } = await import("@/lib/scheduler");
    const { processJob } = await import("@/services/notification.service");
    const email = await import("@/lib/email");
    const close = (await import("vitest")).vi.fn();
    const broken = {
      sendMail: async () => {
        throw Object.assign(new Error("Greeting never received"), { code: "ETIMEDOUT" });
      },
      close,
    };
    email.setTransportForTests(broken as never);
    process.env.SMTP_HOST = "smtp.example.test";
    resetEnvCache();
    try {
      const sup = await superAdmin();
      await createUser(create({ email: "late@team.test", name: "Late" }), sup);
      const job = await claimNextJob("w1", new Date(Date.now() + 1000));
      expect((await processJob(job!, "w1")).outcome).toBe("retry");
      expect(close).toHaveBeenCalled(); // the stuck connection is thrown away
      const after = await ScheduledJob.findById(job!._id).lean();
      expect(after?.status).toBe("pending");
      expect(after?.lastError).toMatch(/Could not reach the mail server smtp\.example\.test/);
      expect((await NotificationLog.findOne({ idempotencyKey: job!.idempotencyKey }).lean())?.status).toBe("failed");
    } finally {
      process.env.SMTP_HOST = "console";
      resetEnvCache();
      email.setTransportForTests(null);
    }
  });

  it("admins can resend a welcome email; inactive users can't get one", async () => {
    const { ScheduledJob } = await import("@/models");
    const { resendWelcome } = await import("@/services/user.service");
    const sup = await superAdmin();
    const u = await createUser(create({ email: "again@team.test", name: "Again" }), sup);
    await resendWelcome(String(u._id), sup);
    expect(await ScheduledJob.countDocuments({ jobType: "user_welcome", userId: u._id })).toBe(2);
    const off = await createUser(create({ email: "off2@team.test", name: "Off", isActive: false }), sup);
    await expect(resendWelcome(String(off._id), sup)).rejects.toMatchObject({ status: 400 });
  });
});

describe("SMTP TLS mode", () => {
  it("port 465 uses TLS unless SMTP_SECURE says otherwise", async () => {
    const { smtpSecure } = await import("@/lib/email");
    const set = (port: string, secure?: string) => {
      process.env.SMTP_PORT = port;
      if (secure === undefined) delete process.env.SMTP_SECURE;
      else process.env.SMTP_SECURE = secure;
      resetEnvCache();
      return smtpSecure();
    };
    try {
      expect(set("465")).toBe(true); // the bug: this used to be false -> "Greeting never received"
      expect(set("587")).toBe(false);
      expect(set("465", "false")).toBe(false);
      expect(set("587", "true")).toBe(true);
    } finally {
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_SECURE;
      resetEnvCache();
    }
  });
});

describe("welcome email duplicates", () => {
  it("several queued welcome emails for one user send only once", async () => {
    const { claimNextJob } = await import("@/lib/scheduler");
    const { processJob } = await import("@/services/notification.service");
    const { resendWelcome } = await import("@/services/user.service");
    const email = await import("@/lib/email");
    const { vi } = await import("vitest");
    const send = vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });
    const sup = await superAdmin();
    const u = await createUser(create({ email: "abhi@team.test", name: "Abhi" }), sup);
    await resendWelcome(String(u._id), sup);
    await resendWelcome(String(u._id), sup);
    const outcomes = [];
    for (let i = 0; i < 3; i++) {
      const job = await claimNextJob("w1", new Date(Date.now() + 1000));
      outcomes.push((await processJob(job!, "w1")).outcome);
    }
    expect(outcomes).toEqual(["sent", "skipped", "skipped"]);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });
});
