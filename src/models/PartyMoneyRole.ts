import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { MONEY_ROLES } from "@/types";

/**
 * A money giver (lender) or provider on a "lender_provider" party.
 * The party giver borrowed money from a money giver; each money giver has exactly one "lend"
 * PartyPayment (payer = party giver, payee = the money giver) that tracks the repayment.
 * Providers collect payments from participants.
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
