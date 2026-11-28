import type { z } from "zod";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { PasswordResetToken, ScheduledJob, User } from "@/models";
import { env } from "@/config/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { enqueueJob } from "@/lib/scheduler";
import type { ChangePasswordSchema, ResetPasswordSchema } from "@/lib/validation";
import { checkLoginRateLimit, hashPassword, revokeSessions, verifyPassword } from "./auth.service";
import { audit } from "./audit.service";

/** "Forgot password" links work for 30 minutes, once. */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
/** At most this many reset emails per account per 15 minutes (more requests are silently ignored). */
const RESETS_PER_WINDOW = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

export const resetPasswordUrl = (token: string) => `${env().APP_URL}/admin/reset-password?token=${encodeURIComponent(token)}`;

type Actor = { id: string; sessionId?: string };

/**
 * Changes the signed-in user's password and signs out their other sessions.
 * Right after a one-time-password sign-in, the current password isn't asked again:
 * that sign-in proved it, and the one-time password can't be used a second time.
 */
export async function changeOwnPassword(actor: Actor, input: z.infer<typeof ChangePasswordSchema>) {
  await connectDB();
  const user = await User.findById(actor.id).select("+passwordHash").lean();
  if (!user) throw notFound("User not found");
  if (!user.mustChangePassword) {
    if (!input.currentPassword || !user.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw badRequest("Your current password is incorrect", { fieldErrors: { currentPassword: ["Incorrect password"] } });
    }
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, tempPasswordUsedAt: null, passwordChangedAt: new Date() } }
  );
  await revokeSessions(user._id, actor.sessionId);
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
  await audit({ action: user.mustChangePassword ? "user.password_set_after_otp" : "user.password_change", entityType: "User", entityId: actor.id, actorId: actor.id });
}

/**
 * Forgot password: queues an email with a reset link for an active user. The answer is the
 * same whether the email exists or not, so nobody can probe which addresses have accounts.
 */
export async function requestPasswordReset(email: string, ip: string) {
  await connectDB();
  await checkLoginRateLimit(`reset-ip:${ip}`);
  const user = await User.findOne({ email: email.toLowerCase().trim(), isActive: true }).select({ _id: 1 }).lean();
  if (!user) {
    await audit({ action: "auth.password_reset_unknown", entityType: "User", reason: email });
    return;
  }
  // Count requests (queued emails), not tokens: each new link replaces the previous token.
  const recent = await ScheduledJob.countDocuments({ jobType: "password_reset", userId: user._id, createdAt: { $gte: new Date(Date.now() - RESET_WINDOW_MS) } });
  if (recent >= RESETS_PER_WINDOW) return;
  const now = new Date();
  // The link itself is made when the email is sent (see notification.service), so it's never stored in the queue.
  await enqueueJob({ jobType: "password_reset", idempotencyKey: `password_reset:${String(user._id)}:${now.getTime()}`, scheduledAt: now, userId: user._id });
  await audit({ action: "auth.password_reset_request", entityType: "User", entityId: String(user._id), reason: ip });
}

/** Called by the email job at send time: a fresh token; older unused links stop working. */
export async function issuePasswordResetToken(userId: Types.ObjectId) {
  const token = randomToken(32);
  await PasswordResetToken.deleteMany({ userId, usedAt: null });
  await PasswordResetToken.create({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) });
  return token;
}

async function findValidToken(token: string) {
  const doc = await PasswordResetToken.findOne({ tokenHash: sha256(token), usedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!doc) return null;
  const user = await User.findOne({ _id: doc.userId, isActive: true }).select({ email: 1, name: 1 }).lean();
  return user ? { doc, user } : null;
}

/** For the reset page: is the link still usable? Doesn't use it up. */
export async function checkPasswordResetToken(token: string) {
  await connectDB();
  if (!token || token.length < 20 || token.length > 200) return null;
  const found = await findValidToken(token);
  return found ? { email: found.user.email, name: found.user.name, expiresAt: found.doc.expiresAt } : null;
}

/** Sets a new password from a reset link. The link works once; every session is signed out. */
export async function resetPasswordWithToken(input: z.infer<typeof ResetPasswordSchema>) {
  await connectDB();
  const invalid = () => badRequest("This reset link is invalid or has expired. Request a new one.", { code: "RESET_LINK_INVALID" });
  const found = await findValidToken(input.token);
  if (!found) throw invalid();
  // Claim the token atomically, so two submits can't both use it.
  const claimed = await PasswordResetToken.updateOne({ _id: found.doc._id, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (!claimed.modifiedCount) throw invalid();
  await User.updateOne(
    { _id: found.user._id },
    { $set: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, tempPasswordUsedAt: null, passwordChangedAt: new Date() } }
  );
  await revokeSessions(found.user._id);
  await PasswordResetToken.deleteMany({ userId: found.user._id, usedAt: null });
  await audit({ action: "user.password_reset", entityType: "User", entityId: String(found.user._id), actorId: String(found.user._id) });
  return { email: found.user.email };
}
