import { connectDB } from "@/lib/mongodb";
import { User } from "@/models";
import { dayKey } from "@/lib/time";
import type { OccasionType, Relation } from "@/types";

/** One yearly occasion, resolved to its next date. */
export type UpcomingOccasion = {
  /** Stable id for lists. */
  key: string;
  userId: string;
  userName: string;
  userEmail: string;
  personName: string;
  relation: Relation;
  occasion: OccasionType;
  label: string;
  /** Original date (birth date, wedding date, joining date). */
  date: string;
  /** Next "yyyy-MM-dd" it falls on (today included). */
  nextDay: string;
  daysAway: number;
  /** Years completed on the next occurrence (age, years married, years at the company). */
  years: number | null;
};

const DAY_MS = 86_400_000;

/** [y, m, d] of a "yyyy-MM-dd" key. */
const parts = (key: string) => key.split("-").map(Number) as [number, number, number];
const pad = (n: number) => String(n).padStart(2, "0");

/** Next occurrence of the month/day of `date`, on or after `today` (both in APP_TIMEZONE). 29 Feb falls on 28 Feb in other years. */
export function nextOccurrence(date: Date | string, todayKey: string) {
  const [oy, om, od] = parts(dayKey(date));
  const [ty, tm, td] = parts(todayKey);
  const fit = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return om === 2 && od === 29 && !leap ? 28 : od;
  };
  let year = ty;
  if (om < tm || (om === tm && fit(ty) < td)) year = ty + 1;
  const nextDay = `${year}-${pad(om)}-${pad(fit(year))}`;
  const daysAway = Math.round((Date.UTC(year, om - 1, fit(year)) - Date.UTC(ty, tm - 1, td)) / DAY_MS);
  return { nextDay, daysAway, years: year - oy > 0 ? year - oy : null };
}

/**
 * Upcoming occasions of all active users within `days` days: their birthday and work
 * anniversary from the profile, plus the occasions they (or an admin) added for relatives.
 */
export async function listUpcomingOccasions(opts: { days?: number; userId?: string; now?: Date } = {}) {
  await connectDB();
  const days = Math.min(Math.max(opts.days ?? 60, 1), 366);
  const today = dayKey(opts.now ?? new Date());
  const filter: Record<string, unknown> = { isActive: true };
  if (opts.userId) filter._id = opts.userId;
  const users = await User.find(filter).select({ name: 1, email: 1, birthday: 1, joinedOn: 1, occasions: 1 }).lean();

  const out: UpcomingOccasion[] = [];
  for (const u of users) {
    const base = { userId: String(u._id), userName: u.name, userEmail: u.email };
    const push = (key: string, o: { personName: string; relation: Relation; occasion: OccasionType; label?: string; date: Date }) => {
      const next = nextOccurrence(o.date, today);
      if (next.daysAway > days) return;
      out.push({ key, ...base, personName: o.personName, relation: o.relation, occasion: o.occasion, label: o.label ?? "", date: new Date(o.date).toISOString(), ...next });
    };
    if (u.birthday) push(`${u._id}:birthday`, { personName: u.name, relation: "Self", occasion: "Birthday", date: u.birthday });
    if (u.joinedOn) push(`${u._id}:joined`, { personName: u.name, relation: "Self", occasion: "Work anniversary", date: u.joinedOn });
    for (const o of u.occasions ?? []) {
      push(`${u._id}:${String(o._id)}`, {
        personName: o.personName,
        relation: (o.relation ?? "Other") as Relation,
        occasion: (o.occasion ?? "Other") as OccasionType,
        label: o.label ?? "",
        date: o.date,
      });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.personName.localeCompare(b.personName));
}
