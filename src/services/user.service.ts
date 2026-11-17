import type { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { assertObjectId, escapeRegex } from "@/lib/utils-server";
import type {
  ChangePasswordSchema,
  ProfileUpdateSchema,
  UserCreateSchema,
  UserListQuerySchema,
  UserUpdateSchema,
} from "@/lib/validation";
import type { AdminRole } from "@/types";
import { audit } from "./audit.service";
import { enqueueJob } from "@/lib/scheduler";
import { mongoSort, parseSort, TEXT_COLLATION } from "@/lib/sort";
import { USER_DEFAULT_SORT, USER_SORT_FIELDS } from "@/lib/sort-fields";
import { hashPassword, revokeSessions, verifyPassword } from "./auth.service";

type CreateInput = z.infer<typeof UserCreateSchema>;
type UpdateInput = z.infer<typeof UserUpdateSchema>;
type ListQuery = z.infer<typeof UserListQuerySchema>;

/** The signed-in admin performing an action. */
export type Actor = { id: string; role: AdminRole; sessionId?: string };

/**
 * Access rules
 * - The Super Admin can never be deleted, deactivated or demoted. Only they can edit their own account.
 * - Admins can't be deleted. Only the Super Admin can create admins, change their role, status
 *   or password, or edit them. To remove an admin, first change their role to member.
 * - Admins and the Super Admin can manage members.
 */
const isSuper = (a: Actor) => a.role === "super_admin";
const requireSuper = (a: Actor, message = "Only the Super Admin can manage admins") => {
  if (!isSuper(a)) throw forbidden(message);
};

export const welcomeKey = (userId: string) => `user_welcome:${userId}`;

/** Sort: Super Admin, admins, then members; active first; then by name. */
const ROLE_ORDER = { super_admin: 0, admin: 1, member: 2 } as const;

export async function listUsers(query: ListQuery) {
  await connectDB();
  const sort = parseSort(query.sort, USER_SORT_FIELDS, USER_DEFAULT_SORT);
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.isActive = query.status === "active";
  if (query.q) {
    const rx = { $regex: escapeRegex(query.q), $options: "i" };
    filter.$or = [{ name: rx }, { email: rx }, { department: rx }, { designation: rx }, { phone: rx }];
  }
  const [rows, total, counts] = await Promise.all([
    User.find(filter)
      .sort(sort.field === "role" ? { name: 1, _id: 1 } : mongoSort(sort, { name: 1, _id: 1 }))
      .collation(TEXT_COLLATION)
      .lean(),
    User.countDocuments(filter),
    User.aggregate<{ _id: string; total: number; active: number }>([
      { $group: { _id: "$role", total: { $sum: 1 }, active: { $sum: { $cond: ["$isActive", 1, 0] } } } },
    ]),
  ]);
  // Role isn't alphabetical: Super Admin, admins, members (active first, then by name).
  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted =
    sort.field === "role"
      ? rows.sort((a, b) => dir * (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
      : rows;
  const start = (query.page - 1) * query.limit;
  const summary = { total: 0, active: 0, admins: 0, members: 0 };
  for (const c of counts) {
    summary.total += c.total;
    summary.active += c.active;
    if (c._id === "member") summary.members += c.total;
    else summary.admins += c.total;
  }
  return { items: sorted.slice(start, start + query.limit), total, summary, sort: sort.value };
}

export async function getUser(id: string) {
  await connectDB();
  const user = await User.findById(assertObjectId(id, "user id")).lean();
  if (!user) throw notFound("User not found");
  return user;
}

/** Active users of every role: party-giver picker and party-email recipients. */
export async function listActiveUsers() {
  await connectDB();
  return User.find({ isActive: true }).sort({ name: 1 }).select({ name: 1, email: 1, role: 1 }).lean();
}

export async function activeUserEmails() {
  await connectDB();
  const rows = await User.find({ isActive: true }).select({ email: 1 }).lean();
  return rows.map((r) => r.email);
}

export async function createUser(input: CreateInput, actor: Actor) {
  await connectDB();
  const { password, ...data } = input;
  if (data.role === "admin") requireSuper(actor);
  if (await User.exists({ email: data.email })) {
    throw conflict("A user with this email already exists", { fieldErrors: { email: ["A user with this email already exists"] } });
  }
  const user = await User.create({
    ...data,
    passwordHash: data.role === "admin" && password ? await hashPassword(password) : null,
  });
  const { passwordHash: _omit, ...safe } = user.toObject();
  void _omit;
  await audit({ action: "user.create", entityType: "User", entityId: String(user._id), actorId: actor.id, newValue: safe });
  // Welcome email, sent by the worker (persistent, retried, never sent twice).
  if (user.isActive) {
    await enqueueJob({ jobType: "user_welcome", idempotencyKey: welcomeKey(String(user._id)), scheduledAt: new Date(), userId: user._id });
  }
  return safe;
}

export async function updateUser(id: string, input: UpdateInput, actor: Actor) {
  await connectDB();
  const _id = assertObjectId(id, "user id");
  const before = await User.findById(_id).select("+passwordHash").lean();
  if (!before) throw notFound("User not found");
  const { password, ...rest } = input;

  if (before.role === "super_admin") {
    if (String(before._id) !== actor.id) throw forbidden("Only the Super Admin can edit their own account");
    if (rest.role !== undefined || rest.isActive === false) throw forbidden("The Super Admin can't be demoted or deactivated");
    if (password) throw badRequest("Change your own password from My profile");
  }
  const nextRole = rest.role ?? before.role;
  const nextActive = rest.isActive ?? before.isActive;
  if (before.role === "admin" || nextRole === "admin") requireSuper(actor);
  if (password && nextRole !== "admin") throw badRequest("Only admins have a sign-in password");
  if (nextRole === "admin" && !password && !before.passwordHash) {
    throw badRequest("Set a password so this admin can sign in", { fieldErrors: { password: ["Required for admins"] } });
  }

  const $set: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (password) $set.passwordHash = await hashPassword(password);
  // A member has no password; demoting an admin removes it.
  if (before.role === "admin" && nextRole === "member") $set.passwordHash = null;

  const after = await User.findByIdAndUpdate(_id, { $set }, { returnDocument: "after", runValidators: true }).lean();
  if (!after) throw notFound("User not found");

  // Losing admin access, being deactivated or getting a new password signs the user out everywhere.
  const lostAccess = before.role === "admin" && (nextRole !== "admin" || !nextActive);
  if (lostAccess || (password && before.role === "admin")) await revokeSessions(_id);

  const { passwordHash: _a, ...prev } = before;
  void _a;
  await audit({
    action: before.role !== nextRole ? `user.role_${nextRole}` : before.isActive !== nextActive ? (nextActive ? "user.activate" : "user.deactivate") : "user.update",
    entityType: "User",
    entityId: id,
    actorId: actor.id,
    previousValue: prev,
    newValue: after,
    reason: password ? "Password changed" : "",
  });
  return after;
}

export async function deleteUser(id: string, actor: Actor) {
  await connectDB();
  const _id = assertObjectId(id, "user id");
  const user = await User.findById(_id).lean();
  if (!user) throw notFound("User not found");
  if (user.role === "super_admin") throw forbidden("The Super Admin can't be deleted");
  if (user.role === "admin") throw forbidden("Admins can't be deleted. Change their role to member first.");
  await User.deleteOne({ _id });
  await revokeSessions(_id);
  await audit({ action: "user.delete", entityType: "User", entityId: id, actorId: actor.id, previousValue: user });
}

/** Queues the welcome email again (e.g. the first one failed or went to spam). */
export async function resendWelcome(id: string, actor: Actor) {
  await connectDB();
  const _id = assertObjectId(id, "user id");
  const user = await User.findById(_id).lean();
  if (!user) throw notFound("User not found");
  if (!user.isActive) throw badRequest("Activate this user before sending them a welcome email");
  // A new key on purpose: this is an explicit, admin-requested resend.
  await enqueueJob({ jobType: "user_welcome", idempotencyKey: `${welcomeKey(id)}:resend:${Date.now()}`, scheduledAt: new Date(), userId: _id });
  await audit({ action: "user.welcome_resend", entityType: "User", entityId: id, actorId: actor.id });
}

/* -------------------------------- my profile -------------------------------- */

export async function updateOwnProfile(actor: Actor, input: z.infer<typeof ProfileUpdateSchema>) {
  await connectDB();
  const $set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const before = await User.findById(actor.id).lean();
  const after = await User.findByIdAndUpdate(actor.id, { $set }, { returnDocument: "after", runValidators: true }).lean();
  if (!after) throw notFound("User not found");
  await audit({ action: "user.profile_update", entityType: "User", entityId: actor.id, actorId: actor.id, previousValue: before, newValue: after });
  return after;
}

/** Changes the signed-in user's password and signs out their other sessions. */
export async function changeOwnPassword(actor: Actor, input: z.infer<typeof ChangePasswordSchema>) {
  await connectDB();
  const user = await User.findById(actor.id).select("+passwordHash").lean();
  if (!user) throw notFound("User not found");
  if (!(await verifyPassword(input.currentPassword, user.passwordHash)) || !user.passwordHash) {
    throw badRequest("Your current password is incorrect", { fieldErrors: { currentPassword: ["Incorrect password"] } });
  }
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(input.newPassword) } });
  await revokeSessions(user._id, actor.sessionId);
  await audit({ action: "user.password_change", entityType: "User", entityId: actor.id, actorId: actor.id });
}
