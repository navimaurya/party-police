import { connectDB } from "@/lib/mongodb";
import { AppSettings, BudgetSettings } from "@/models";
import { unprocessable } from "@/lib/errors";
import { EVENT_CATEGORIES, type EventCategory } from "@/types";
import type { z } from "zod";
import type { BudgetSettingsUpdateSchema } from "@/lib/validation";
import { getSettings } from "./settings.service";
import { audit } from "./audit.service";

export async function getBudgetConfig() {
  await connectDB();
  const [settings, rows] = await Promise.all([getSettings(), BudgetSettings.find().lean()]);
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]));
  return {
    validationEnabled: settings.budgetSettings?.validationEnabled !== false,
    categories: EVENT_CATEGORIES.map((category) => byCategory[category] ?? null).filter(Boolean) as typeof rows,
    missing: EVENT_CATEGORIES.filter((c) => !byCategory[c]),
  };
}

export async function updateBudgetConfig(input: z.infer<typeof BudgetSettingsUpdateSchema>, actorId: string) {
  await connectDB();
  const before = await getBudgetConfig();
  if (input.validationEnabled !== undefined) {
    await AppSettings.updateOne(
      { key: "global" },
      { $set: { "budgetSettings.validationEnabled": input.validationEnabled } },
      { upsert: true }
    );
  }
  for (const c of input.categories ?? []) {
    await BudgetSettings.updateOne(
      { category: c.category },
      {
        $set: {
          minimumBudget: c.noMinimum ? null : c.minimumBudget,
          maximumBudget: c.noMaximum ? null : c.maximumBudget,
          noMinimum: c.noMinimum,
          noMaximum: c.noMaximum,
          currency: c.currency,
          isEnabled: c.isEnabled,
        },
      },
      { upsert: true }
    );
  }
  const after = await getBudgetConfig();
  // Historical events are intentionally untouched: budget is an event-level value.
  await audit({
    action: "budget.settings_update",
    entityType: "BudgetSettings",
    actorId,
    previousValue: before,
    newValue: after,
  });
  return after;
}

export type BudgetCheck = { ok: true } | { ok: false; min: number | null; max: number | null; message: string };

/** Pure range check. `null` limit = unlimited only when explicitly flagged. */
export function checkBudgetRange(
  budget: number,
  rule: { minimumBudget?: number | null; maximumBudget?: number | null; noMinimum?: boolean; noMaximum?: boolean }
): BudgetCheck {
  const min = rule.noMinimum ? null : (rule.minimumBudget ?? null);
  const max = rule.noMaximum ? null : (rule.maximumBudget ?? null);
  if (min !== null && budget < min)
    return { ok: false, min, max, message: `Budget ₹${budget} is below the minimum of ₹${min}. Don't be stingy! 🪙` };
  if (max !== null && budget > max)
    return { ok: false, min, max, message: `Budget ₹${budget} exceeds the maximum of ₹${max}. Easy there, millionaire! 💸` };
  return { ok: true };
}

/**
 * Validates an event budget against the configured category range.
 * Out-of-range budgets are rejected unless an explicit admin override is supplied,
 * in which case the override is recorded in the audit log.
 */
export async function enforceBudget(opts: {
  category: EventCategory;
  budget: number | null | undefined;
  override?: { reason: string };
  actorId: string;
  eventId?: string;
}): Promise<{ overridden: boolean }> {
  if (opts.budget === null || opts.budget === undefined) return { overridden: false };
  const settings = await getSettings();
  if (settings.budgetSettings?.validationEnabled === false) return { overridden: false };
  const rule = await BudgetSettings.findOne({ category: opts.category }).lean();
  if (!rule || !rule.isEnabled) return { overridden: false };
  const result = checkBudgetRange(opts.budget, rule);
  if (result.ok) return { overridden: false };
  if (!opts.override) {
    throw unprocessable("BUDGET_OUT_OF_RANGE", result.message, {
      min: result.min,
      max: result.max,
      category: opts.category,
    });
  }
  await audit({
    action: "budget.override",
    entityType: "PartyEvent",
    entityId: opts.eventId ?? null,
    actorId: opts.actorId,
    previousValue: { min: result.min, max: result.max, category: opts.category },
    newValue: { budget: opts.budget },
    reason: opts.override.reason || "(no reason given)",
  });
  return { overridden: true };
}
