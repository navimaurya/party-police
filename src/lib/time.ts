import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { env } from "@/config/env";

/**
 * Server-side calendar helpers in the app's timezone (APP_TIMEZONE).
 * The server may run in UTC; "party day" and "9 AM" always mean the team's local time.
 */
export const appTimeZone = () => env().APP_TIMEZONE;

/** "yyyy-MM-dd" of the given instant in the app timezone. */
export function dayKey(d: Date | string) {
  return format(new TZDate(new Date(d).getTime(), appTimeZone()), "yyyy-MM-dd");
}

/** The instant of hour:00 on the given local day. */
export function atLocalHour(key: string, hour: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, hour, 0, 0, appTimeZone()).getTime());
}

/** [start, end) of the given local day. */
export function localDayRange(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const tz = appTimeZone();
  return { start: new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime()), end: new Date(new TZDate(y, m - 1, d + 1, 0, 0, 0, tz).getTime()) };
}

/** date-fns format in the app timezone (for emails, which are rendered on the server). */
export function formatInZone(d: Date | string, pattern: string) {
  return format(new TZDate(new Date(d).getTime(), appTimeZone()), pattern);
}
