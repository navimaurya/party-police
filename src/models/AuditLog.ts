import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const AuditLogSchema = new Schema(
  {
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: null },
    actorId: { type: String, default: null },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ action: 1 });

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema>;
export const AuditLog: Model<AuditLogDoc> =
  (models.AuditLog as Model<AuditLogDoc>) || model<AuditLogDoc>("AuditLog", AuditLogSchema);
