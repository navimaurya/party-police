import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { EVENT_CATEGORIES } from "@/types";

/**
 * Per-category budget limits. `null` limits are only valid when the matching
 * `noMinimum` / `noMaximum` flag is explicitly true (= unlimited).
 */
const BudgetSettingsSchema = new Schema(
  {
    category: { type: String, enum: EVENT_CATEGORIES, required: true, unique: true },
    minimumBudget: { type: Number, min: 0, default: null },
    maximumBudget: { type: Number, min: 0, default: null },
    noMinimum: { type: Boolean, default: false },
    noMaximum: { type: Boolean, default: false },
    currency: { type: String, default: "INR" },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type BudgetSettingsDoc = InferSchemaType<typeof BudgetSettingsSchema>;
export const BudgetSettings: Model<BudgetSettingsDoc> =
  (models.BudgetSettings as Model<BudgetSettingsDoc>) ||
  model<BudgetSettingsDoc>("BudgetSettings", BudgetSettingsSchema);
