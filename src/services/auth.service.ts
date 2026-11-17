import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { LoginAttempt, Session, User } from "@/models";
import { env } from "@/config/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { tooManyRequests, unauthorized } from "@/lib/errors";
import type { AdminRole } from "@/types";
import { audit } from "./audit.service";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;

/** Roles that may sign in to the admin panel. */
export const SIGN_IN_ROLES: AdminRole[] = ["super_admin", "admin"];

// Used to equalise timing when the email does not exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("party-police-timing-guard", BCRYPT_ROUNDS));

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  return bcrypt.compare(password, hash ?? (await getDummyHash()));
}

/** Signs a user out everywhere. */
export async function revokeSessions(userId: unknown, exceptSessionId?: string) {
  const filter: Record<string, unknown> = { userId };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  await Session.deleteMany(filter);
}

/**
 * Creates or updates the Super Admin from ADMIN_EMAIL / ADMIN_PASSWORD (seed scripts).
 * - No Super Admin yet: the user with that email is promoted, or a new user is created.
 * - ADMIN_EMAIL changed: the Super Admin account moves to the new email (there is only one).
 * - `resetPassword`: takes the password from env again.
 */
export async function upsertAdminFromEnv(opts: { resetPassword?: boolean } = {}) {
  await connectDB();
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  if (ADMIN_PASSWORD.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  const email = ADMIN_EMAIL.toLowerCase();

  const current = await User.findOne({ role: "super_admin" }).lean();
  const sameEmail = await User.findOne({ email }).lean();

  if (!current) {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    if (sameEmail) {
      await User.updateOne({ _id: sameEmail._id }, { $set: { role: "super_admin", passwordHash, isActive: true } });
      await revokeSessions(sameEmail._id);
    } else {
      await User.create({ email, name: "Super Admin", role: "super_admin", passwordHash });
    }
    return { created: true };
  }

  const emailChanged = current.email !== email;
  if (emailChanged && sameEmail) {
    throw new Error(`${email} already belongs to another user (${sameEmail.name}). Delete that user or choose another ADMIN_EMAIL.`);
  }
  if (!emailChanged && !opts.resetPassword) return { created: false };
  const $set: Record<string, unknown> = { email, isActive: true };
  // Moving the account to a new email always takes the password from env too.
  if (opts.resetPassword || emailChanged) $set.passwordHash = await hashPassword(ADMIN_PASSWORD);
  await User.updateOne({ _id: current._id }, { $set });
  await revokeSessions(current._id);
  return { created: false, passwordReset: true, emailChanged };
}

/** First-run convenience: creates the Super Admin from env if there is none yet. */
async function bootstrapAdminIfEmpty() {
  if (await User.exists({ role: "super_admin" })) return;
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  if (ADMIN_EMAIL && ADMIN_PASSWORD && ADMIN_PASSWORD.length >= 10) {
    await upsertAdminFromEnv();
  }
}

/** Email address of the (active) Super Admin. */
export async function superAdminEmails() {
  await connectDB();
  const rows = await User.find({ role: "super_admin", isActive: true }).select({ email: 1 }).lean();
  return rows.map((r) => r.email);
}

/** Atomic fixed-window counter. Throws 429 when exceeded. */
export async function checkLoginRateLimit(key: string, now = new Date()) {
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);
  // Reset stale windows atomically, then increment.
  await LoginAttempt.updateOne(
    { key, windowStart: { $lt: windowStart } },
    { $set: { count: 0, windowStart: now, expiresAt: new Date(now.getTime() + LOGIN_WINDOW_MS) } }
  );
  const doc = await LoginAttempt.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { windowStart: now, expiresAt: new Date(now.getTime() + LOGIN_WINDOW_MS) },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();
  if (doc && doc.count > LOGIN_MAX_ATTEMPTS) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((new Date(doc.windowStart).getTime() + LOGIN_WINDOW_MS - now.getTime()) / 1000)
    );
    throw tooManyRequests("Too many sign-in attempts. Please wait a few minutes and try again.", retryAfterSec);
  }
}

export async function clearLoginRateLimit(key: string) {
  await LoginAttempt.deleteOne({ key });
}

export async function login(input: { email: string; password: string; ip: string; userAgent?: string }) {
  await connectDB();
  const email = input.email.toLowerCase().trim();
  // Limit by IP and by account so neither can be brute forced independently.
  await checkLoginRateLimit(`ip:${input.ip}`);
  await checkLoginRateLimit(`email:${email}`);
  await bootstrapAdminIfEmpty();

  // Only active admins can sign in; members have no password.
  const user = await User.findOne({ email, role: { $in: SIGN_IN_ROLES }, isActive: true }).select("+passwordHash").lean();
  const valid = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !user.passwordHash || !valid) {
    await audit({ action: "auth.login_failed", entityType: "User", reason: email });
    throw unauthorized("Invalid email or password");
  }

  await clearLoginRateLimit(`email:${email}`);
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt,
    userAgent: (input.userAgent ?? "").slice(0, 300),
  });
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await audit({ action: "auth.login", entityType: "User", entityId: String(user._id), actorId: String(user._id) });
  return { token, expiresAt, admin: { id: String(user._id), email: user.email, name: user.name, role: user.role as AdminRole } };
}

/** The signed-in admin (Super Admin or admin). */
export type AdminIdentity = { id: string; email: string; name: string; role: AdminRole; sessionId: string };

/** Server-side session validation. Only the SHA-256 of the token is stored. */
export async function validateSessionToken(token: string | undefined | null): Promise<AdminIdentity | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  await connectDB();
  const session = await Session.findOne({ tokenHash: sha256(token) }).lean();
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  // Re-checked on every request: a demoted or deactivated admin loses access immediately.
  const user = await User.findOne({ _id: session.userId, role: { $in: SIGN_IN_ROLES }, isActive: true }).lean();
  if (!user) return null;
  return { id: String(user._id), email: user.email, name: user.name, role: user.role as AdminRole, sessionId: String(session._id) };
}

export async function logout(token: string | undefined | null) {
  if (!token) return;
  await connectDB();
  await Session.deleteOne({ tokenHash: sha256(token) });
}
