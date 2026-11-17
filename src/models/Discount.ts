import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { DISCOUNT_TYPES, EVENT_CATEGORIES } from "@/types";

const DiscountSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    code: { type: String, trim: true, uppercase: true, maxlength: 50, default: "" },
    discountType: { type: String, enum: DISCOUNT_TYPES, required: true },
    discountValue: { type: Number, required: true, min: 0 },
    applicableVenue: { type: String, trim: true, maxlength: 300, default: "" },
    /** Empty array = applies to all categories. */
    applicableCategories: { type: [String], enum: EVENT_CATEGORIES, default: [] },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    termsAndConditions: { type: String, trim: true, maxlength: 3000, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DiscountSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
DiscountSchema.index({ validUntil: 1 });

export type DiscountDoc = InferSchemaType<typeof DiscountSchema>;
export const Discount: Model<DiscountDoc> =
  (models.Discount as Model<DiscountDoc>) || model<DiscountDoc>("Discount", DiscountSchema);
