import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { MONEY_ROLES } from "@/types";

/**
 * A lender or provider on a "lender_provider" party.
 * Lenders front money for the party; providers collect payments from participants.
 * Each lender has exactly one "lend" PartyPayment that tracks what they provided.
 */
const PartyMoneyRoleSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "PartyEvent", required: true },
    role: { type: String, enum: MONEY_ROLES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, default: null },
    /** Where payments to this person go. Empty = the UPI ID on their user profile. */
    upiId: { type: String, trim: true, maxlength: 100, default: "" },
    /** personKey(name, email): the same person can't hold the same role twice on a party. */
    personKey: { type: String, required: true },
  },
  { timestamps: true }
);

PartyMoneyRoleSchema.index({ eventId: 1, role: 1, personKey: 1 }, { unique: true });
PartyMoneyRoleSchema.index({ email: 1 });

export type PartyMoneyRoleDoc = InferSchemaType<typeof PartyMoneyRoleSchema>;
export const PartyMoneyRole: Model<PartyMoneyRoleDoc> =
  (models.PartyMoneyRole as Model<PartyMoneyRoleDoc>) || model<PartyMoneyRoleDoc>("PartyMoneyRole", PartyMoneyRoleSchema);
