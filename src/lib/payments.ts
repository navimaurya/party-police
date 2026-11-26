/**
 * Party payment maths. Pure functions, safe on the server and in the browser.
 * Money is handled in integer paise so partial payments never drift (0.1 + 0.2 problems).
 * The browser uses these only for display: every amount is (re)computed on the server.
 */
import type { PaymentStatus, PaymentViewStatus } from "@/types";

/** Rupees -> integer paise. Rejects anything finer than a paisa. */
export function toPaise(rupees: number) {
  const p = Math.round(rupees * 100);
  if (!Number.isFinite(rupees) || Math.abs(rupees * 100 - p) > 1e-6) throw new RangeError("Amount must have at most 2 decimals");
  return p;
}

export function fromPaise(paise: number) {
  return paise / 100;
}

/** True when the amount has at most 2 decimals (used by the input validation). */
export function isWholePaise(rupees: number) {
  return Number.isFinite(rupees) && Math.abs(rupees * 100 - Math.round(rupees * 100)) <= 1e-6;
}

/** Never negative, even if the data were somehow inconsistent. */
export function remainingPaise(totalPaise: number, paidPaise: number) {
  return Math.max(0, totalPaise - paidPaise);
}

export function storedStatus(totalPaise: number, paidPaise: number): PaymentStatus {
  if (paidPaise <= 0) return "pending";
  return paidPaise >= totalPaise ? "paid" : "partially_paid";
}

/**
 * The status to show. `dueDay` and `today` are "yyyy-MM-dd" in the team's timezone:
 * a payment is overdue the day AFTER its due date, while anything is still owed.
 */
export function viewStatus(totalPaise: number, paidPaise: number, dueDay: string | null, today: string): PaymentViewStatus {
  const s = storedStatus(totalPaise, paidPaise);
  if (s !== "paid" && dueDay && dueDay < today) return "overdue";
  return s;
}

/** Key that identifies a person within a party: email when known, else the name. */
export function personKey(p: { name?: string | null; email?: string | null }) {
  return p.email ? `e:${p.email.trim().toLowerCase()}` : `n:${(p.name ?? "").trim().toLowerCase()}`;
}
