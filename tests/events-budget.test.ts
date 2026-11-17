import { describe, expect, it } from "vitest";
import { AuditLog, PartyEvent } from "@/models";
import { createEvent, listEvents, updateEvent } from "@/services/event.service";
import { updateBudgetConfig } from "@/services/budget.service";
import { CreateEventSchema } from "@/lib/validation";
import { baseEvent, makeAdmin, setBudget } from "./helpers";

const parse = (o: Record<string, unknown>) => CreateEventSchema.parse(o);

describe("party events", () => {
  it("allows multiple monthly parties in the same month by the same person", async () => {
    const actor = await makeAdmin();
    const d = new Date(Date.now() + 5 * 86400_000);
    for (let i = 0; i < 3; i++) await createEvent(parse(baseEvent({ title: `Treat ${i}`, eventDate: d })), actor);
    expect(await PartyEvent.countDocuments({ category: "monthly", organizerName: "Ravi" })).toBe(3);
  });

  it("defaults category to monthly", () => {
    const { category, ...rest } = baseEvent();
    void category;
    expect(parse(rest).category).toBe("monthly");
  });

  it("hides private events from public listings", async () => {
    const actor = await makeAdmin();
    await createEvent(parse(baseEvent({ title: "Secret", publicVisibility: false })), actor);
    await createEvent(parse(baseEvent({ title: "Open" })), actor);
    const q = { page: 1, limit: 20 } as const;
    expect((await listEvents(q, { admin: false })).items.map((e) => e.title)).toEqual(["Open"]);
    expect((await listEvents(q, { admin: true })).total).toBe(2);
  });
});

describe("budget validation", () => {
  it("rejects budgets outside the configured range", async () => {
    const actor = await makeAdmin();
    await setBudget("monthly", 500, 3000);
    await expect(createEvent(parse(baseEvent({ budget: 100 })), actor)).rejects.toMatchObject({ status: 422, code: "BUDGET_OUT_OF_RANGE" });
    await expect(createEvent(parse(baseEvent({ budget: 5000 })), actor)).rejects.toMatchObject({ status: 422 });
    await expect(createEvent(parse(baseEvent({ budget: 1500 })), actor)).resolves.toBeTruthy();
  });

  it("treats explicitly unlimited maximums as unlimited", async () => {
    const actor = await makeAdmin();
    await setBudget("occasional", 1000, null);
    await expect(createEvent(parse(baseEvent({ category: "occasional", budget: 9_999_999 })), actor)).resolves.toBeTruthy();
  });

  it("allows admin overrides and records them in the audit log", async () => {
    const actor = await makeAdmin();
    await setBudget("monthly", 500, 3000);
    const e = await createEvent(parse(baseEvent({ budget: 10000, budgetOverride: { reason: "Biryani for 40" } })), actor);
    expect(e.budget).toBe(10000);
    const log = await AuditLog.findOne({ action: "budget.override" }).lean();
    expect(log?.reason).toBe("Biryani for 40");
    expect(log?.entityId).toBe(String(e._id));
  });

  it("can be disabled globally", async () => {
    const actor = await makeAdmin();
    await setBudget("monthly", 500, 3000);
    await updateBudgetConfig({ validationEnabled: false }, actor);
    await expect(createEvent(parse(baseEvent({ budget: 1 })), actor)).resolves.toBeTruthy();
  });

  it("does not modify or re-validate historical events when settings change", async () => {
    const actor = await makeAdmin();
    await setBudget("monthly", 500, 3000);
    const e = await createEvent(parse(baseEvent({ budget: 2500 })), actor);
    await updateBudgetConfig({ categories: [{ category: "monthly", minimumBudget: 100, maximumBudget: 1000, noMinimum: false, noMaximum: false, currency: "INR", isEnabled: true }] }, actor);
    expect((await PartyEvent.findById(e._id).lean())?.budget).toBe(2500);
    // Editing an unrelated field must not fail on the now out-of-range budget.
    await expect(updateEvent(String(e._id), { title: "Renamed" }, actor)).resolves.toMatchObject({ title: "Renamed", budget: 2500 });
  });

  it("requires explicit flags for null limits", async () => {
    const { BudgetSettingItemSchema } = await import("@/lib/validation");
    expect(BudgetSettingItemSchema.safeParse({ category: "monthly", minimumBudget: null, maximumBudget: 100 }).success).toBe(false);
    expect(BudgetSettingItemSchema.safeParse({ category: "monthly", noMinimum: true, maximumBudget: 100 }).success).toBe(true);
  });
});
