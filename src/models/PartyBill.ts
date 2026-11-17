import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { FILE_KINDS } from "@/types";

/** Metadata only. The binary lives on local disk under STORAGE_PATH/{storageKey}. */
const PartyBillSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "PartyEvent", required: true, index: true },
    kind: { type: String, enum: FILE_KINDS, default: "bill" },
    originalFileName: { type: String, required: true, maxlength: 255 },
    /** Relative key such as `bills/{eventId}/{fileId}.pdf`. Never sent to clients. */
    storageKey: { type: String, required: true, unique: true, select: false },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    amount: { type: Number, min: 0, default: null },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    isPublic: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

PartyBillSchema.index({ eventId: 1, uploadedAt: -1 });
PartyBillSchema.index({ isPublic: 1 });

export type PartyBillDoc = InferSchemaType<typeof PartyBillSchema>;
export const PartyBill: Model<PartyBillDoc> =
  (models.PartyBill as Model<PartyBillDoc>) || model<PartyBillDoc>("PartyBill", PartyBillSchema);
