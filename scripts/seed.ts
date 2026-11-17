/**
 * Development seed: admin, default budget limits, settings, and sample data.
 *   npm run seed            # refuses to run with NODE_ENV=production
 *   npm run seed -- --fresh # wipe party data first (dev only)
 */
import "@/config/load-dotenv";
import { connectDB, disconnectDB } from "@/lib/mongodb";
import { AppSettings, BudgetSettings, Discount, PartyCommitment, PartyEvent } from "@/models";
import { upsertAdminFromEnv } from "@/services/auth.service";

const day = 86400_000;
const at = (days: number, hour = 13) => {
  const d = new Date(Date.now() + days * day);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed sample data in production. Use `npm run seed:admin` instead.");
  }
  await connectDB();
  await upsertAdminFromEnv();

  // Defaults are written to MongoDB once; after that the admin owns them.
  for (const b of [
    { category: "monthly", minimumBudget: 500, maximumBudget: 5000 },
    { category: "special", minimumBudget: 1000, maximumBudget: 15000 },
    { category: "occasional", minimumBudget: 1000, maximumBudget: 25000 },
  ] as const) {
    await BudgetSettings.updateOne({ category: b.category }, { $setOnInsert: { ...b, noMinimum: false, noMaximum: false, isEnabled: true, currency: "INR" } }, { upsert: true });
  }
  await AppSettings.updateOne({ key: "global" }, { $setOnInsert: { key: "global" } }, { upsert: true });

  if (process.argv.includes("--fresh")) {
    await Promise.all([PartyEvent.deleteMany({}), PartyCommitment.deleteMany({}), Discount.deleteMany({})]);
  }
  if ((await PartyEvent.estimatedDocumentCount()) > 0) {
    console.info("ℹ️  Party data already present; skipping samples (use --fresh to reseed).");
    return;
  }

  const prefs = { reminders: true, announcement: true, updates: true, thankYou: true, includeBillLinks: true };
  const [promo] = await PartyEvent.insertMany([
    { title: "Ravi's Promotion Pizza Bash 🍕", eventType: "scheduled", category: "special", organizerName: "Ravi", occasion: "Promotion", location: "Pizza Palace", eventDate: at(3, 19), budget: 6000, participants: [{ name: "Priya" }, { name: "Arjun" }, { name: "Meera" }], notificationPreferences: prefs, description: "Ravi finally got promoted. Unlimited pizza. Attendance mandatory." },
    { title: "November Team Lunch", eventType: "scheduled", category: "monthly", organizerName: "Priya", occasion: "Monthly treat", location: "Office cafeteria", eventDate: at(8), budget: 2500, notificationPreferences: prefs },
    { title: "Second Monthly Treat (because why not)", eventType: "scheduled", category: "monthly", organizerName: "Priya", occasion: "Team lunch", location: "Biryani House", eventDate: at(15), budget: 3000, notificationPreferences: prefs },
    { title: "Project Phoenix Launch Party 🚀", eventType: "scheduled", category: "occasional", organizerName: "Team Phoenix", occasion: "Project completion", location: "Rooftop", eventDate: at(21, 18), budget: 18000, notificationPreferences: prefs },
    { title: "Samosas in the pantry RIGHT NOW", eventType: "instant", category: "occasional", organizerName: "Meera", occasion: "Random celebration", location: "3rd floor pantry", eventDate: new Date(), budget: 600, notificationPreferences: prefs },
    { title: "Diwali Sweets Extravaganza 🪔", eventType: "scheduled", category: "occasional", organizerName: "Arjun", occasion: "Festival", location: "Office", eventDate: at(-20), budget: 4000, status: "completed", completedAt: at(-20, 20), completionVersion: 1, notificationPreferences: prefs },
    { title: "Kiran's Birthday Cake", eventType: "scheduled", category: "special", organizerName: "Kiran", occasion: "Birthday", location: "Conference room B", eventDate: at(-9, 16), budget: 1500, status: "completed", completedAt: at(-9, 18), completionVersion: 1, notificationPreferences: prefs },
  ]);

  await PartyCommitment.insertMany([
    { personName: "Vikram", reason: "Salary hike (he thinks we don't know)", commitmentDate: at(-60), dueDate: at(-45) },
    { personName: "Sneha", reason: "New job offer", commitmentDate: at(-25), dueDate: at(-12) },
    { personName: "Rahul", reason: "Bought a new house", commitmentDate: at(-10), dueDate: at(-4) },
    { personName: "Ravi", reason: "Promotion to Tech Lead", commitmentDate: at(-14), dueDate: at(3), relatedEventId: promo._id },
    { personName: "Arjun", reason: "Diwali bonus", commitmentDate: at(-40), dueDate: at(-22), status: "completed", completedAt: at(-20) },
    { personName: "Kiran", reason: "Birthday", commitmentDate: at(-15), dueDate: at(-9), status: "completed", completedAt: at(-9) },
  ]);

  await Discount.insertMany([
    { title: "Get 20% OFF on your party order!", discountType: "percentage", discountValue: 20, code: "PARTY20", applicableVenue: "Pizza Palace", validUntil: at(30), description: "Valid on orders above ₹2000.", isActive: true },
    { title: "Flat ₹500 off on cakes", discountType: "fixed", discountValue: 500, applicableCategories: ["special"], validUntil: at(14), isActive: true },
    { title: "Expired Halloween deal (hidden)", discountType: "percentage", discountValue: 30, validUntil: at(-10), isActive: true },
  ]);
  console.info("🎉 Seeded sample parties, commitments and discounts.");
}

main()
  .then(() => console.info("✅ Seed complete"))
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
