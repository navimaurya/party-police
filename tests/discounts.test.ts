import { describe, expect, it } from "vitest";
import { Discount } from "@/models";
import { listActiveDiscounts } from "@/services/discount.service";

const day = 86400_000;
const make = (o: Record<string, unknown>) =>
  Discount.create({ title: "Deal", discountType: "percentage", discountValue: 20, isActive: true, ...o });

describe("public discount visibility", () => {
  it("hides expired, future and inactive discounts", async () => {
    await make({ title: "active" });
    await make({ title: "expired", validUntil: new Date(Date.now() - day) });
    await make({ title: "future", validFrom: new Date(Date.now() + day) });
    await make({ title: "inactive", isActive: false });
    await make({ title: "windowed", validFrom: new Date(Date.now() - day), validUntil: new Date(Date.now() + day) });
    const titles = (await listActiveDiscounts()).map((d) => d.title).sort();
    expect(titles).toEqual(["active", "windowed"]);
  });

  it("filters by applicable category and venue", async () => {
    await make({ title: "all" });
    await make({ title: "special-only", applicableCategories: ["special"] });
    await make({ title: "pizza-place", applicableVenue: "Pizza Palace" });
    expect((await listActiveDiscounts({ category: "monthly" })).map((d) => d.title).sort()).toEqual(["all", "pizza-place"]);
    expect((await listActiveDiscounts({ category: "special", venue: "pizza palace" })).map((d) => d.title).sort()).toEqual(["all", "pizza-place", "special-only"]);
    expect((await listActiveDiscounts({ venue: "Burger Barn" })).map((d) => d.title).sort()).toEqual(["all", "special-only"]);
  });

  it("returns nothing when there are no discounts (section hidden)", async () => {
    expect(await listActiveDiscounts()).toHaveLength(0);
  });
});
