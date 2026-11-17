import { describe, expect, it } from "vitest";
import { CreateEventSchema, EventListQuerySchema, UserCreateSchema, UserListQuerySchema } from "@/lib/validation";
import { mongoSort, nextSort, parseSort } from "@/lib/sort";
import { EVENT_SORT_FIELDS } from "@/lib/sort-fields";
import { createEvent, listEvents } from "@/services/event.service";
import { createUser, listUsers } from "@/services/user.service";
import { baseEvent, makeAdmin } from "./helpers";

const day = 86400_000;

describe("sort helpers", () => {
  it("parses against an allow-list and falls back to the default", () => {
    expect(parseSort("-budget", EVENT_SORT_FIELDS, "eventDate")).toMatchObject({ field: "budget", dir: "desc" });
    expect(parseSort(undefined, EVENT_SORT_FIELDS, "eventDate")).toMatchObject({ field: "eventDate", dir: "asc" });
    expect(parseSort("passwordHash", EVENT_SORT_FIELDS, "eventDate")).toMatchObject({ field: "eventDate", dir: "asc" });
    expect(parseSort("-$where", EVENT_SORT_FIELDS, "eventDate").field).toBe("eventDate");
  });

  it("toggles direction on the same column", () => {
    expect(nextSort("eventDate", "eventDate")).toBe("-eventDate");
    expect(nextSort("-eventDate", "eventDate")).toBe("eventDate");
    expect(nextSort("eventDate", "budget", "desc")).toBe("-budget");
  });

  it("never lets a tiebreaker override the chosen direction", () => {
    expect(mongoSort(parseSort("-name", ["name"], "name"), { name: 1, _id: 1 })).toEqual({ name: -1, _id: 1 });
    expect(Object.keys(mongoSort(parseSort("budget", ["budget"], "budget"), { eventDate: 1, _id: 1 }))).toEqual(["budget", "eventDate", "_id"]);
  });
});

describe("party lists", () => {
  async function seed() {
    const actor = await makeAdmin();
    const now = Date.now();
    for (const [title, host, offset, budget] of [
      ["Charlie party", "zoe", 3, 1000],
      ["alpha party", "Amit", 1, 3000],
      ["Bravo party", "amit", 2, 2000],
    ] as const) {
      await createEvent(CreateEventSchema.parse(baseEvent({ title, organizerName: host, eventDate: new Date(now + offset * day), budget })), actor);
    }
  }
  const titles = async (sort?: string) =>
    (await listEvents(EventListQuerySchema.parse({ sort }), { admin: true })).items.map((e) => e.title);

  it("defaults to party date, earliest first", async () => {
    await seed();
    expect(await titles()).toEqual(["alpha party", "Bravo party", "Charlie party"]);
  });

  it("sorts by date desc, title (case-insensitive), host (then date) and budget", async () => {
    await seed();
    expect(await titles("-eventDate")).toEqual(["Charlie party", "Bravo party", "alpha party"]);
    expect(await titles("title")).toEqual(["alpha party", "Bravo party", "Charlie party"]);
    expect(await titles("organizerName")).toEqual(["alpha party", "Bravo party", "Charlie party"]);
    expect(await titles("-budget")).toEqual(["alpha party", "Bravo party", "Charlie party"]);
    expect(await titles("budget")).toEqual(["Charlie party", "Bravo party", "alpha party"]);
  });

  it("ignores unknown sort fields", async () => {
    await seed();
    expect(await titles("__proto__")).toEqual(["alpha party", "Bravo party", "Charlie party"]);
  });
});

describe("users list", () => {
  it("defaults to Super Admin, admins, members; sorts by name either way", async () => {
    const sup = { id: await makeAdmin(), role: "super_admin" as const };
    await createUser(UserCreateSchema.parse({ email: "zed@t.test", name: "zed" }), sup);
    await createUser(UserCreateSchema.parse({ email: "amy@t.test", name: "Amy", role: "admin", password: "admin-pass-123" }), sup);
    const names = async (sort?: string) => (await listUsers(UserListQuerySchema.parse({ sort }))).items.map((u) => u.name);
    expect(await names()).toEqual(["Boss", "Amy", "zed"]);
    expect(await names("-role")).toEqual(["zed", "Amy", "Boss"]);
    expect(await names("name")).toEqual(["Amy", "Boss", "zed"]);
    expect(await names("-name")).toEqual(["zed", "Boss", "Amy"]);
  });
});
