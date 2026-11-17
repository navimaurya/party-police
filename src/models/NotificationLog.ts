import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { NOTIFICATION_LOG_STATUSES, NOTIFICATION_TYPES } from "@/types";

const NotificationLogSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "PartyEvent", default: null },
    commitmentId: { type: Schema.Types.ObjectId, ref: "PartyCommitment", default: null },
    /** For user-level emails (welcome). */
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    jobId: { type: Schema.Types.ObjectId, ref: "ScheduledJob", default: null },
    recipient: { type: [String], default: [] },
    subject: { type: String, default: "" },
    notificationType: { type: String, enum: NOTIFICATION_TYPES, required: true },
    status: { type: String, enum: NOTIFICATION_LOG_STATUSES, required: true },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 },
    errorMessage: { type: String, default: "" },
    messageId: { type: String, default: "" },
    /** Last SMTP server reply, e.g. "250 OK queued as …" (proof the server accepted it). */
    smtpResponse: { type: String, default: "" },
    /** One log per logical email. Unique index = delivery-state guard against duplicates. */
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

NotificationLogSchema.index({ createdAt: -1 });
NotificationLogSchema.index({ status: 1, createdAt: -1 });
NotificationLogSchema.index({ eventId: 1 });

export type NotificationLogDoc = InferSchemaType<typeof NotificationLogSchema>;
export const NotificationLog: Model<NotificationLogDoc> =
  (models.NotificationLog as Model<NotificationLogDoc>) ||
  model<NotificationLogDoc>("NotificationLog", NotificationLogSchema);
