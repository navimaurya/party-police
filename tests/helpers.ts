import { User } from "@/models";
import { hashPassword } from "@/services/auth.service";
import { BudgetSettings, AppSettings } from "@/models";

export async function makeAdmin() {
  const admin = await User.create({ email: "boss@party.test", name: "Boss", role: "super_admin", passwordHash: await hashPassword("super-secret-pass") });
  return String(admin._id);
}

export async function setBudget(category: "monthly" | "special" | "occasional", min: number | null, max: number | null) {
  await BudgetSettings.create({
    category,
    minimumBudget: min,
    maximumBudget: max,
    noMinimum: min === null,
    noMaximum: max === null,
    isEnabled: true,
  });
}

export async function setRecipients(recipients: string[]) {
  await AppSettings.updateOne({ key: "global" }, { $set: { recipients } }, { upsert: true });
}

export const baseEvent = (overrides: Record<string, unknown> = {}) => ({
  title: "Monthly Pizza",
  eventType: "scheduled" as const,
  category: "monthly" as const,
  organizerName: "Ravi",
  occasion: "Monthly treat",
  description: "",
  location: "Office",
  eventDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
  participants: [],
  currency: "INR",
  publicVisibility: true,
  status: "upcoming" as const,
  ...overrides,
});
