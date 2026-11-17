import type mongoose from "mongoose";

type Db = NonNullable<typeof mongoose.connection.db>;

/**
 * One-time migration from the old layout (separate `admins` + `members` collections)
 * to the single `users` collection. Idempotent: safe to run more than once.
 *
 * - The Super Admin keeps its _id, so audit-log actor ids still point at it.
 * - Admin members keep their member _id and take the password from their old admin login.
 * - Party approvals that referenced an old admin login are re-pointed to the user.
 * - Sessions are cleared (everyone signs in again).
 * - With `dropOld`, the old collections are dropped after a successful copy.
 */
export async function migrateLegacyUsers(db: Db, opts: { dropOld?: boolean } = {}) {
  const has = async (name: string) => (await db.listCollections({ name }).toArray()).length > 0;
  const admins = (await has("admins")) ? await db.collection("admins").find().toArray() : [];
  const members = (await has("members")) ? await db.collection("members").find().toArray() : [];
  const users = db.collection("users");
  const report = { superAdmin: 0, admins: 0, members: 0, skipped: 0, approvalsRepointed: 0, droppedOld: false };
  if (!admins.length && !members.length) return report;

  const now = new Date();
  const memberByEmail = new Map(members.map((m) => [String(m.email).toLowerCase(), m]));
  const adminIdToUserId = new Map<string, unknown>();
  const profile = (m: Record<string, unknown> | undefined) => ({
    phone: m?.phone ?? "",
    department: m?.department ?? "",
    designation: m?.designation ?? "",
    birthday: m?.birthday ?? null,
    joinedOn: m?.joinedOn ?? null,
    notes: m?.notes ?? "",
  });

  // 1) Super Admin(s) from the old admins collection (role missing or "super_admin").
  const supers = admins.filter((a) => a.role !== "admin").sort((a, b) => +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0));
  const existingSuper = await users.findOne({ role: "super_admin" });
  for (const [i, a] of supers.entries()) {
    const email = String(a.email).toLowerCase();
    const m = memberByEmail.get(email);
    if (existingSuper || i > 0) {
      // Only one Super Admin may exist; extra ones become admins.
      adminIdToUserId.set(String(a._id), existingSuper?._id ?? a._id);
      if (i > 0 && !(await users.findOne({ email }))) {
        await users.insertOne({ _id: a._id, email, name: (m?.name as string) ?? email.split("@")[0], role: "admin", passwordHash: a.passwordHash ?? null, ...profile(m), isActive: true, lastLoginAt: null, createdAt: a.createdAt ?? now, updatedAt: now });
        report.admins++;
      } else report.skipped++;
      memberByEmail.delete(email);
      continue;
    }
    await users.updateOne(
      { email },
      {
        $set: { role: "super_admin", passwordHash: a.passwordHash ?? null, isActive: true, updatedAt: now },
        $setOnInsert: { _id: a._id, email, name: (m?.name as string) ?? "Super Admin", ...profile(m), lastLoginAt: null, createdAt: a.createdAt ?? now },
      },
      { upsert: true }
    );
    adminIdToUserId.set(String(a._id), (await users.findOne({ email }, { projection: { _id: 1 } }))!._id);
    memberByEmail.delete(email);
    report.superAdmin++;
  }

  // 2) Members (admin members take the password from their old admin login).
  for (const m of memberByEmail.values()) {
    const email = String(m.email).toLowerCase();
    if (await users.findOne({ email })) {
      report.skipped++;
      continue;
    }
    const login = admins.find((a) => a.role === "admin" && String(a.email).toLowerCase() === email);
    const isAdmin = m.role === "admin" && !!login?.passwordHash;
    await users.insertOne({
      _id: m._id,
      email,
      name: m.name ?? email,
      role: isAdmin ? "admin" : "member",
      passwordHash: isAdmin ? login!.passwordHash : null,
      ...profile(m),
      isActive: m.isActive !== false,
      lastLoginAt: null,
      createdAt: m.createdAt ?? now,
      updatedAt: now,
    });
    if (login) adminIdToUserId.set(String(login._id), m._id);
    if (isAdmin) report.admins++;
    else report.members++;
  }

  // 3) Re-point party approvals made by old admin logins.
  for (const [oldId, userId] of adminIdToUserId) {
    if (oldId === String(userId)) continue;
    const res = await db.collection("partyevents").updateMany({ approvedBy: { $in: [oldId, ...(admins.filter((a) => String(a._id) === oldId).map((a) => a._id))] } }, { $set: { approvedBy: userId } });
    report.approvalsRepointed += res.modifiedCount;
  }

  // 4) Old sessions referenced admin ids: everyone signs in again.
  if (await has("sessions")) await db.collection("sessions").deleteMany({});

  if (opts.dropOld) {
    if (await has("admins")) await db.collection("admins").drop();
    if (await has("members")) await db.collection("members").drop();
    report.droppedOld = true;
  }
  return report;
}
