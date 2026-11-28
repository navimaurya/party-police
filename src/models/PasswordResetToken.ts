import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * A "forgot password" link. Only the SHA-256 of the token is stored; the token itself exists
 * only in the email. Valid once, for PASSWORD_RESET_TTL_MS; MongoDB deletes expired ones.
 */
const PasswordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasswordResetTokenSchema.index({ userId: 1, createdAt: -1 });

export type PasswordResetTokenDoc = InferSchemaType<typeof PasswordResetTokenSchema>;
export const PasswordResetToken: Model<PasswordResetTokenDoc> =
  (models.PasswordResetToken as Model<PasswordResetTokenDoc>) || model<PasswordResetTokenDoc>("PasswordResetToken", PasswordResetTokenSchema);
