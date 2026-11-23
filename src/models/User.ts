import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { OCCASION_TYPES, RELATIONS, USER_ROLES } from "@/types";

/** A personal occasion: the user's own or a relative's (birthday, anniversary...). Repeats every year. */
const OccasionSchema = new Schema(
  {
    personName: { type: String, required: true, trim: true, maxlength: 100 },
    relation: { type: String, enum: RELATIONS, default: "Self" },
    occasion: { type: String, enum: OCCASION_TYPES, default: "Birthday" },
    /** Custom label when occasion is "Other". */
    label: { type: String, trim: true, maxlength: 100, default: "" },
    date: { type: Date, required: true },
  },
  { _id: true }
);

/**
 * Everyone in the app lives in one collection: the Super Admin, admins, managers and members.
 * Every user is a party member (receives party emails and can be a party giver).
 * Every user with a password can sign in; what they can do depends on their role.
 *
 * Email is the unique key. It is never changed through the app.
 */
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    role: { type: String, enum: USER_ROLES, default: "member" },
    /** Users without one can't sign in yet (they get one through the credentials email). */
    passwordHash: { type: String, default: null, select: false },
    /**
     * Set when the password was issued by someone else (Super Admin reset, credentials email).
     * Such a password works for ONE sign-in, and that session can only change the password.
     */
    mustChangePassword: { type: Boolean, default: false },
    /** When the one-time password was used to sign in. A second sign-in with it is refused. */
    tempPasswordUsedAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    department: { type: String, trim: true, maxlength: 100, default: "" },
    designation: { type: String, trim: true, maxlength: 100, default: "" },
    /** For contri parties they host: others scan a QR to pay them back. */
    upiId: { type: String, trim: true, maxlength: 100, default: "" },
    birthday: { type: Date, default: null },
    joinedOn: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    occasions: { type: [OccasionSchema], default: [] },
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
