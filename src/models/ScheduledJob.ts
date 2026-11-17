import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { JOB_STATUSES, NOTIFICATION_TYPES } from "@/types";

/** Persistent job store for the MongoDB-backed scheduler. */
const ScheduledJobSchema = new Schema(
  {
    jobType: { type: String, enum: NOTIFICATION_TYPES, required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "PartyEvent", default: null },
    commitmentId: { type: Schema.Types.ObjectId, ref: "PartyCommitment", default: null },
    /** For user-level emails (welcome). */
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: JOB_STATUSES, default: "pending" },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    idempotencyKey: { type: String, required: true, unique: true },
    completionVersion: { type: Number, default: null },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ScheduledJobSchema.index({ status: 1, scheduledAt: 1 });
ScheduledJobSchema.index({ status: 1, lockedAt: 1 });
ScheduledJobSchema.index({ eventId: 1, jobType: 1, status: 1 });

export type ScheduledJobDoc = InferSchemaType<typeof ScheduledJobSchema>;
export const ScheduledJob: Model<ScheduledJobDoc> =
  (models.ScheduledJob as Model<ScheduledJobDoc>) || model<ScheduledJobDoc>("ScheduledJob", ScheduledJobSchema);
