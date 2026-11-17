import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const SessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// MongoDB TTL index removes expired sessions automatically.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = InferSchemaType<typeof SessionSchema>;
export const Session: Model<SessionDoc> =
  (models.Session as Model<SessionDoc>) || model<SessionDoc>("Session", SessionSchema);
