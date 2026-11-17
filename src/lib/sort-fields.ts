/** Allowed sort fields and defaults for each list (shared by pages, API and services). */

export const EVENT_SORT_FIELDS = ["eventDate", "title", "organizerName", "budget", "status", "createdAt"] as const;
/** Party lists default to party date, earliest first. */
export const EVENT_DEFAULT_SORT = "eventDate";

export const USER_SORT_FIELDS = ["role", "name", "email", "department", "isActive", "lastLoginAt", "createdAt"] as const;
/** Super Admin, then admins, then members. */
export const USER_DEFAULT_SORT = "role";

export const COMMITMENT_SORT_FIELDS = ["dueDate", "personName", "commitmentDate", "status"] as const;
/** Earliest due first = most overdue first. */
export const COMMITMENT_DEFAULT_SORT = "dueDate";

export const DISCOUNT_SORT_FIELDS = ["title", "value", "validUntil", "isActive", "createdAt"] as const;
export const DISCOUNT_DEFAULT_SORT = "-createdAt";

export const BILL_SORT_FIELDS = ["uploadedAt", "originalFileName", "fileSize", "amount"] as const;
export const BILL_DEFAULT_SORT = "-uploadedAt";

/** Fields that should sort case-insensitively. */
export const TEXT_SORT_FIELDS = new Set(["title", "organizerName", "name", "email", "department", "personName", "originalFileName"]);
