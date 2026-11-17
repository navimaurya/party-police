import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { USER_ROLES } from "@/types";

/**
 * Everyone in the app lives in one collection: the Super Admin, admins and members.
 * Every user is a party member (receives party emails and can be a party giver).
 * Admins and the Super Admin can also sign in to the admin panel.
 *
 * Email is the unique key. It is never changed through the app.
 */
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    role: { type: String, enum: USER_ROLES, default: "member" },
    /** Only users who can sign in (admin, super_admin) have one. */
    passwordHash: { type: String, default: null, select: false },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    department: { type: String, trim: true, maxlength: 100, default: "" },
    designation: { type: String, trim: true, maxlength: 100, default: "" },
    birthday: { type: Date, default: null },
    joinedOn: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "users" }
);

UserSchema.index({ isActive: 1, name: 1 });
UserSchema.index({ role: 1, isActive: 1 });
// There can only ever be one Super Admin.
UserSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "super_admin" }, name: "one_super_admin" });

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const User: Model<UserDoc> = (models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);
