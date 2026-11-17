import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { COMMITMENT_STATUSES } from "@/types";

const PartyCommitmentSchema = new Schema(
  {
    personName: { type: String, required: true, trim: true, maxlength: 100 },
    personEmail: { type: String, trim: true, lowercase: true, maxlength: 200 },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    commitmentDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: COMMITMENT_STATUSES, default: "pending" },
    completedAt: { type: Date, default: null },
    relatedEventId: { type: Schema.Types.ObjectId, ref: "PartyEvent", default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PartyCommitmentSchema.index({ status: 1, dueDate: 1 });
PartyCommitmentSchema.index({ relatedEventId: 1 });
PartyCommitmentSchema.index({ status: 1, completedAt: -1 });

export type PartyCommitmentDoc = InferSchemaType<typeof PartyCommitmentSchema>;
export const PartyCommitment: Model<PartyCommitmentDoc> =
  (models.PartyCommitment as Model<PartyCommitmentDoc>) ||
  model<PartyCommitmentDoc>("PartyCommitment", PartyCommitmentSchema);
