import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { PAYMENT_KINDS, PAYMENT_METHODS, PAYMENT_STATUSES } from "@/types";

/** One recorded payment (full or partial) against an obligation. Voided, never deleted. */
const PaymentTransactionSchema = new Schema(
  {
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: "upi" },
    /** UPI / bank transaction reference, if the payer shared one. */
    reference: { type: String, trim: true, maxlength: 100, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    paidAt: { type: Date, required: true },
    recordedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    recordedByEmail: { type: String, default: "" },
    recordedByName: { type: String, default: "" },
    /** Sent by the client with each "Mark as paid": a retried or double-clicked submit is applied once. */
    idempotencyKey: { type: String, required: true },
    /** Marked paid by the payer themselves ("I've paid"), not by whoever received it. */
    selfReported: { type: Boolean, default: false },
    /**
     * "pending": the payer says they paid; it counts only once whoever received the money (or an
     * admin) approves it. "confirmed": counts towards paidPaise. "rejected": never counted.
     * Older transactions have no value = confirmed.
     */
    approval: { type: String, enum: ["confirmed", "pending", "rejected"], default: "confirmed" },
    reviewedAt: { type: Date, default: null },
    reviewedByEmail: { type: String, default: "" },
    reviewedByName: { type: String, default: "" },
    reviewNote: { type: String, trim: true, maxlength: 300, default: "" },
    /** Created by "Change status" rather than an actual payment entry. */
    adjustment: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
    voidedByEmail: { type: String, default: "" },
    voidReason: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * A payment obligation on a party: who owes how much to whom, and what was paid so far.
 * Amounts are integer paise. `paidPaise` is the sum of the non-voided transactions and is
 * only changed together with them, in one atomic update guarded by `revision`.
 */
const PartyPaymentSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "PartyEvent", required: true },
    kind: { type: String, enum: PAYMENT_KINDS, required: true },
    payerName: { type: String, required: true, trim: true, maxlength: 100 },
    payerEmail: { type: String, trim: true, lowercase: true, maxlength: 200, default: null },
    /** Payer when they are a lender/provider (set on "other" records only; unused for now). */
    payerRoleId: { type: Schema.Types.ObjectId, ref: "PartyMoneyRole", default: null },
    /** Who receives the money: a money giver/provider, or null = the party giver. "lend": the money giver. */
    payeeRoleId: { type: Schema.Types.ObjectId, ref: "PartyMoneyRole", default: null },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    paidPaise: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: "pending" },
    dueDate: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    /**
     * "contri": a share created and kept in sync from the contri split (one per participant).
     * Editing it by hand turns it into "manual", and the split no longer changes it.
     */
    source: { type: String, enum: ["manual", "contri"], default: "manual" },
    /** One share per person and one borrowed-money record per money giver, per party. Null for "other". */
    dedupeKey: { type: String, default: null },
    transactions: { type: [PaymentTransactionSchema], default: [] },
    /** Optimistic concurrency for every change to the amounts. */
    revision: { type: Number, default: 0 },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

PartyPaymentSchema.index({ eventId: 1, kind: 1, createdAt: 1 });
PartyPaymentSchema.index({ eventId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });
PartyPaymentSchema.index({ payerEmail: 1 });
PartyPaymentSchema.index({ payeeRoleId: 1 });

export type PartyPaymentDoc = InferSchemaType<typeof PartyPaymentSchema>;
export const PartyPayment: Model<PartyPaymentDoc> =
  (models.PartyPayment as Model<PartyPaymentDoc>) || model<PartyPaymentDoc>("PartyPayment", PartyPaymentSchema);
