import { connectDB } from "@/lib/mongodb";
import { AppSettings } from "@/models";
import type { z } from "zod";
import type { SettingsUpdateSchema } from "@/lib/validation";
import { audit } from "./audit.service";
import type { NotificationType } from "@/types";

export async function getSettings() {
  await connectDB();
  const doc = await AppSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
  return doc!;
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;

export function isNotificationTypeEnabled(settings: Settings, type: NotificationType) {
  if (!settings.notificationEnabled) return false;
  const types = (settings.notificationTypes ?? {}) as Record<string, boolean | undefined>;
  return types[type] !== false;
}

/** Flattens nested objects into dot paths so partial updates don't clobber siblings. */
function toDotPaths(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, toDotPaths(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

export async function updateSettings(input: z.infer<typeof SettingsUpdateSchema>, actorId: string) {
  const before = await getSettings();
  const $set = toDotPaths(input as Record<string, unknown>);
  if (input.recipients) $set.recipients = [...new Set(input.recipients.map((r) => r.toLowerCase()))];
  if (input.reminderIntervals) $set.reminderIntervals = [...new Set(input.reminderIntervals)].sort((a, b) => b - a);
  const after = await AppSettings.findOneAndUpdate({ key: "global" }, { $set }, { returnDocument: "after" }).lean();
  await audit({
    action: "settings.update",
    entityType: "AppSettings",
    entityId: String(before._id),
    actorId,
    previousValue: before,
    newValue: after,
  });
  return after!;
}
