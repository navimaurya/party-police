/**
 * Password policy, shared by the server (validation) and the browser (strength meter).
 * Pure functions: safe on both sides. The server is the one that enforces it.
 */

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordRule = { id: "length" | "upper" | "lower" | "number" | "special"; label: string; test: (pw: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { id: "upper", label: "A capital letter (A–Z)", test: (pw) => /[A-Z]/.test(pw) },
  { id: "lower", label: "A small letter (a–z)", test: (pw) => /[a-z]/.test(pw) },
  { id: "number", label: "A number (0–9)", test: (pw) => /\d/.test(pw) },
  { id: "special", label: "A special character (!@#$…)", test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

/** The rules a password breaks (empty = it meets the policy). */
export function passwordProblems(pw: string) {
  return PASSWORD_RULES.filter((r) => !r.test(pw));
}

export function meetsPasswordPolicy(pw: string) {
  return pw.length <= PASSWORD_MAX_LENGTH && passwordProblems(pw).length === 0;
}

const COMMON = ["password", "qwerty", "123456", "abc123", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon", "party"];

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong" };

/**
 * A rough strength score for the meter. Meeting the policy gets you to "Fair"; length and
 * variety push it higher; common words and repeated characters pull it down.
 */
export function passwordStrength(pw: string): PasswordStrength {
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
  if (!pw) return { score: 0, label: labels[0] };
  const met = PASSWORD_RULES.filter((r) => r.test(pw)).length;
  let score = met <= 2 ? 0 : met <= 4 ? 1 : 2;
  if (met === PASSWORD_RULES.length) {
    if (pw.length >= 10) score++;
    if (pw.length >= 14 || (pw.match(/[^A-Za-z0-9\s]/g)?.length ?? 0) >= 2) score++;
  }
  const lowered = pw.toLowerCase();
  if (COMMON.some((w) => lowered.includes(w)) || /(.)\1{2,}/.test(pw) || new Set(pw).size < Math.min(5, pw.length)) score = Math.max(met === PASSWORD_RULES.length ? 1 : 0, score - 1);
  const s = Math.min(4, Math.max(0, score)) as PasswordStrength["score"];
  return { score: s, label: labels[s] };
}
