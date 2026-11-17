import { describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import { User } from "@/models";
import { migrateLegacyUsers } from "@/lib/migrations/users";

describe("legacy admins + members -> users migration", () => {
  it("merges both collections, keeps ids and passwords, and is idempotent", async () => {
    const db = mongoose.connection.db!;
    const superId = new Types.ObjectId();
    const adminLoginId = new Types.ObjectId();
    const adminMemberId = new Types.ObjectId();
    await db.collection("admins").insertMany([
      { _id: superId, email: "boss@old.test", passwordHash: "hash-super", createdAt: new Date(2026, 0, 1) },
      { _id: adminLoginId, email: "ada@old.test", passwordHash: "hash-ada", role: "admin", memberId: adminMemberId },
    ]);
    await db.collection("members").insertMany([
      { _id: adminMemberId, email: "ada@old.test", name: "Ada", role: "admin", isActive: true, department: "Eng" },
      { email: "priya@old.test", name: "Priya", role: "member", isActive: false },
      { email: "boss@old.test", name: "The Boss", role: "member", isActive: true },
    ]);
    await db.collection("partyevents").insertOne({ title: "Old party", approvedBy: adminLoginId });

    const report = await migrateLegacyUsers(db, { dropOld: true });
    expect(report).toMatchObject({ superAdmin: 1, admins: 1, members: 1, approvalsRepointed: 1, droppedOld: true });

    const boss = await User.findOne({ email: "boss@old.test" }).select("+passwordHash").lean();
    expect(boss).toMatchObject({ role: "super_admin", name: "The Boss", passwordHash: "hash-super" });
    expect(String(boss!._id)).toBe(String(superId));
    const ada = await User.findOne({ email: "ada@old.test" }).select("+passwordHash").lean();
    expect(ada).toMatchObject({ role: "admin", passwordHash: "hash-ada", department: "Eng" });
    expect(String(ada!._id)).toBe(String(adminMemberId));
    expect(await User.findOne({ email: "priya@old.test" }).lean()).toMatchObject({ role: "member", isActive: false });
    expect(String((await db.collection("partyevents").findOne({ title: "Old party" }))!.approvedBy)).toBe(String(adminMemberId));
    expect(await db.listCollections({ name: "admins" }).toArray()).toHaveLength(0);
    expect(await db.listCollections({ name: "members" }).toArray()).toHaveLength(0);

    // Running again is a no-op.
    expect(await migrateLegacyUsers(db, { dropOld: true })).toMatchObject({ superAdmin: 0, admins: 0, members: 0 });
    expect(await User.countDocuments()).toBe(3);
  });
});
