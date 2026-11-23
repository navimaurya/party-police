/**
 * Contri party maths and UPI payment links. Pure functions: safe on the server and in the browser.
 *
 * Example: the host paid ₹100 and 5 people (host included) were at the party, so each
 * person owes ₹20, and the 4 guests scan a QR for ₹20 that pays the host's UPI ID.
 */

type Person = { name?: string | null; email?: string | null };

export type ContriInput = {
  category: string;
  title: string;
  organizerName: string;
  organizerEmail?: string | null;
  participants?: Person[] | null;
  budget?: number | null;
  contri?: { totalAmount?: number | null; splitCount?: number | null; upiId?: string | null } | null;
};

export type ContriSplit = {
  total: number;
  /** People splitting the bill, host included. */
  headcount: number;
  /** What each person owes, rounded UP to the paisa so the host is never short. */
  perHead: number;
  /** How many people pay the host (everyone but the host). */
  payers: number;
  /** Where the money goes; "" when the host hasn't added one. */
  upiId: string;
  /** upi:// link for the per-head amount; null without a UPI ID. */
  upiLink: string | null;
};

const key = (p: Person) => (p.email ? `e:${p.email.trim().toLowerCase()}` : `n:${(p.name ?? "").trim().toLowerCase()}`);

/** Participants plus the host, counted once each. */
export function defaultHeadcount(e: Pick<ContriInput, "participants" | "organizerName" | "organizerEmail">) {
  const people = new Set((e.participants ?? []).filter((p) => p.email || p.name).map(key));
  const host = { name: e.organizerName, email: e.organizerEmail };
  // The host may be in the participant list by email or by name.
  if (!people.has(key(host)) && !people.has(key({ name: e.organizerName }))) people.add(key(host));
  return people.size;
}

/** Rounds up to 2 decimals (paise), avoiding float noise like 20.000000001 -> 20.01. */
export function roundUpToPaisa(n: number) {
  return Math.ceil(Math.round(n * 1e6) / 1e4) / 100;
}

/**
 * The split for a contri party, or null when it isn't one or there's nothing to split yet.
 * `hostUpiId` is the host's profile UPI ID; the party's own UPI ID wins over it.
 */
export function computeContriSplit(e: ContriInput, hostUpiId?: string | null): ContriSplit | null {
  if (e.category !== "contri") return null;
  const total = e.contri?.totalAmount ?? e.budget ?? null;
  if (!total || total <= 0) return null;
  const headcount = Math.max(1, e.contri?.splitCount ?? defaultHeadcount(e));
  const perHead = roundUpToPaisa(total / headcount);
  const upiId = (e.contri?.upiId || hostUpiId || "").trim();
  return {
    total,
    headcount,
    perHead,
    payers: Math.max(0, headcount - 1),
    upiId,
    upiLink: upiId ? upiPayLink({ upiId, payeeName: e.organizerName, amount: perHead, note: `Contri: ${e.title}` }) : null,
  };
}

/** Standard UPI deep link (NPCI "upi://pay"): any UPI app opens it with the amount filled in. */
export function upiPayLink(o: { upiId: string; payeeName: string; amount: number; note: string }) {
  const params = new URLSearchParams({
    pa: o.upiId,
    pn: o.payeeName.slice(0, 50),
    am: o.amount.toFixed(2),
    cu: "INR",
    tn: o.note.slice(0, 80),
  });
  // UPI apps expect %20 for spaces, not "+".
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

export function formatRupees(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
}
