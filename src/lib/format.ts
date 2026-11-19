import { format } from "date-fns";

export function formatMoney(amount: number | null | undefined, currency = "INR") {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "EEE, d MMM yyyy · h:mm a");
}

/** Party dates: parties are scheduled by day, so no time is shown. */
export function formatPartyDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "EEE, d MMM yyyy");
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "d MMM yyyy");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Value for <input type="datetime-local"> in the viewer's local timezone. */
export function toDateTimeLocal(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(new Date(d), "yyyy-MM-dd'T'HH:mm");
}

export function toDateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return format(new Date(d), "yyyy-MM-dd");
}
