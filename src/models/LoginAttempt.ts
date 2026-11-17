import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Fixed-window login rate limiting, stored in MongoDB (no Redis). */
const LoginAttemptSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  windowStart: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});
LoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type LoginAttemptDoc = InferSchemaType<typeof LoginAttemptSchema>;
export const LoginAttempt: Model<LoginAttemptDoc> =
  (models.LoginAttempt as Model<LoginAttemptDoc>) || model<LoginAttemptDoc>("LoginAttempt", LoginAttemptSchema);
