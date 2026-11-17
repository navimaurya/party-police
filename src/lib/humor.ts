import { differenceInCalendarDays } from "date-fns";

export const QUOTES = [
  "Life is short. Salaries are temporary. Parties are mandatory!",
  "Nobody escapes the Party Committee! 🎉",
  "Your achievements are temporary. Your party debt is permanent!",
  "Welcome to the Official Party Department! 🎉",
  "A promotion without a party is just extra work. 😤",
  "We don't forget parties. We don't forgive party debts.",
  "Behind every great salary hike is a hungry team. 🍕",
  "In Party We Trust. 🙏",
  "Calories don't count when someone else is paying. 🍰",
  "Your wallet called. We told it to get ready. 💸",
] as const;

export function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

/** Days past the due date (0 if not overdue yet). */
export function overdueDays(dueDate: Date | string, now: Date = new Date()) {
  return Math.max(0, differenceInCalendarDays(now, new Date(dueDate)));
}

export function teaseFor(days: number): string {
  if (days <= 0) return "Tick tock... the clock is ticking ⏰";
  if (days <= 7) return "We're patiently waiting! 🍕";
  if (days <= 15) return "Your wallet seems suspiciously quiet! 👀";
  if (days <= 30) return "Are you planning to retire without giving us a party? 😂";
  return "PUBLIC NOTICE: This person owes us a party! 🚨";
}

export type ShameLevel = "waiting" | "mild" | "medium" | "spicy" | "nuclear";

export function shameLevel(days: number): ShameLevel {
  if (days <= 0) return "waiting";
  if (days <= 7) return "mild";
  if (days <= 15) return "medium";
  if (days <= 30) return "spicy";
  return "nuclear";
}

export const EMPTY_STATES = {
  parties: "No parties yet. Somebody get promoted already! 🙄",
  upcoming: "No upcoming parties. The Party Committee is starving. 🥲",
  shame: "The Hall of Shame is empty. Everyone paid up! Suspicious... 🤨",
  legends: "No legends yet. Be the first to host a party! 🏆",
  discounts: "No deals right now. Full price it is! 💸",
  bills: "No bills uploaded. Was it even a party? 🧾",
  instant: "No breaking news. All quiet on the party front. 📻",
};
