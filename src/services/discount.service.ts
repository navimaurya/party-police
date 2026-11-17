import type { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Discount } from "@/models";
import { badRequest, notFound } from "@/lib/errors";
import { assertObjectId, escapeRegex } from "@/lib/utils-server";
import type { DiscountCreateSchema, DiscountUpdateSchema } from "@/lib/validation";
import type { EventCategory } from "@/types";
import { audit } from "./audit.service";
import { mongoSort, parseSort, TEXT_COLLATION } from "@/lib/sort";
import { DISCOUNT_DEFAULT_SORT, DISCOUNT_SORT_FIELDS } from "@/lib/sort-fields";

/** Mongo filter for discounts that are visible to the public right now. */
export function activeDiscountFilter(now = new Date()) {
  return {
    isActive: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validUntil: null }, { validUntil: { $gte: now } }] },
    ],
  };
}

/**
 * Public listing. Inactive and expired discounts are never returned.
 * When category/venue is given, only discounts applicable to it are returned
 * (an empty applicableCategories / applicableVenue means "applies everywhere").
 */
export async function listActiveDiscounts(opts: { category?: EventCategory; venue?: string; now?: Date } = {}) {
  await connectDB();
  const filter: Record<string, unknown> = activeDiscountFilter(opts.now);
  const and = filter.$and as unknown[];
  if (opts.category) {
    and.push({ $or: [{ applicableCategories: { $size: 0 } }, { applicableCategories: opts.category }] });
  }
  if (opts.venue) {
    and.push({
      $or: [
        { applicableVenue: "" },
        { applicableVenue: { $regex: `^${escapeRegex(opts.venue.trim())}$`, $options: "i" } },
      ],
    });
  }
  return Discount.find(filter).sort({ validUntil: 1, createdAt: -1 }).limit(50).lean();
}

export async function listAllDiscounts(opts: { page: number; limit: number; q?: string; sort?: string }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.q) filter.title = { $regex: escapeRegex(opts.q), $options: "i" };
  const [items, total] = await Promise.all([
    Discount.find(filter)
      .sort(mongoSort(parseSort(opts.sort, DISCOUNT_SORT_FIELDS, DISCOUNT_DEFAULT_SORT), { createdAt: -1, _id: 1 }))
      .collation(TEXT_COLLATION)
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .lean(),
    Discount.countDocuments(filter),
  ]);
  return { items, total };
}

export async function createDiscount(input: z.infer<typeof DiscountCreateSchema>, actorId: string) {
  await connectDB();
  const doc = await Discount.create(input);
  await audit({ action: "discount.create", entityType: "Discount", entityId: String(doc._id), actorId, newValue: input });
  return doc.toObject();
}

export async function updateDiscount(id: string, input: z.infer<typeof DiscountUpdateSchema>, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id);
  const before = await Discount.findById(_id).lean();
  if (!before) throw notFound("Discount not found");
  const merged = { ...before, ...input };
  if (merged.validFrom && merged.validUntil && merged.validFrom > merged.validUntil) {
    throw badRequest("Valid until must be after valid from");
  }
  if (merged.discountType === "percentage" && merged.discountValue > 100) {
    throw badRequest("Percentage cannot exceed 100");
  }
  const after = await Discount.findByIdAndUpdate(_id, { $set: input }, { returnDocument: "after", runValidators: true }).lean();
  await audit({ action: "discount.update", entityType: "Discount", entityId: id, actorId, previousValue: before, newValue: after });
  return after!;
}

export async function deleteDiscount(id: string, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id);
  const before = await Discount.findByIdAndDelete(_id).lean();
  if (!before) throw notFound("Discount not found");
  await audit({ action: "discount.delete", entityType: "Discount", entityId: id, actorId, previousValue: before });
}
