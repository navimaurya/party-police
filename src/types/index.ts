export const EVENT_CATEGORIES = ["monthly", "special", "occasional"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_TYPES = ["scheduled", "instant"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ["upcoming", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const COMMITMENT_STATUSES = ["pending", "completed", "waived"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const FILE_KINDS = ["bill", "attachment"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const NOTIFICATION_TYPES = [
  "upcoming_reminder",
  "instant_announcement",
  "defaulter_reminder",
  "overdue_notice",
  "event_update",
  "event_cancelled",
  "thank_you",
  "party_day",
  "party_giver_notice",
  "party_approval_request",
  "party_giver_thanks",
  "user_welcome",
  "user_credentials",
  "user_role_upgrade",
  "event_scheduled",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const JOB_STATUSES = ["pending", "processing", "completed", "failed", "cancelled", "skipped"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const NOTIFICATION_LOG_STATUSES = ["sending", "sent", "failed", "uncertain", "skipped"] as const;
export type NotificationLogStatus = (typeof NOTIFICATION_LOG_STATUSES)[number];

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  monthly: "Monthly Party",
  special: "Special Personal Event",
  occasional: "Occasional Party",
};

export const CATEGORY_EMOJI: Record<EventCategory, string> = {
  monthly: "🍕",
  special: "🎂",
  occasional: "🎊",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  upcoming_reminder: "Upcoming party reminders",
  instant_announcement: "Instant party announcements",
  defaulter_reminder: "Defaulter reminders",
  overdue_notice: "Overdue notifications",
  event_update: "Event updates",
  event_cancelled: "Event cancellations",
  thank_you: "Thank-you emails (everyone)",
  party_day: "Party-day email to all members (daily)",
  party_giver_notice: "Party-day email to the party giver",
  party_approval_request: "Party-day approval request to the Super Admin",
  party_giver_thanks: "Thanks to the party giver after approval",
  user_welcome: "Welcome email to new users",
  user_credentials: "Login credentials (username + one-time password)",
  user_role_upgrade: "Role upgrade notice to the user",
  event_scheduled: "New party announcement to participants",
};

export const USER_ROLES = ["super_admin", "admin", "manager", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can be given through the app. There is exactly one Super Admin, set from env. */
export const ASSIGNABLE_ROLES = ["member", "manager", "admin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Roles with full access to the admin panel. */
export type AdminRole = "super_admin" | "admin";

/**
 * Higher = more power. Used for "role upgrade" emails and permission checks.
 * - member:  signs in, adds their OWN parties, asks for approval once given.
 * - manager: schedules and modifies anyone's parties.
 * - admin:   everything except managing admins.
 */
export const ROLE_RANK: Record<UserRole, number> = { member: 0, manager: 1, admin: 2, super_admin: 3 };

/** Can schedule / modify parties hosted by anyone. */
export const isPartyManager = (role: UserRole) => ROLE_RANK[role] >= ROLE_RANK.manager;
export const isAdminRole = (role: UserRole): role is AdminRole => ROLE_RANK[role] >= ROLE_RANK.admin;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

/** Personal occasions stored on a user (their own and their relatives'). */
export const OCCASION_TYPES = ["Birthday", "Anniversary", "Work anniversary", "Other"] as const;
export type OccasionType = (typeof OCCASION_TYPES)[number];
export const RELATIONS = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Other"] as const;
export type Relation = (typeof RELATIONS)[number];

export const SPECIAL_OCCASIONS = [
  "Birthday",
  "Marriage",
  "Anniversary",
  "New job",
  "Promotion",
  "Salary hike",
  "New house",
  "Personal achievement",
  "Other",
] as const;

export const OCCASIONAL_OCCASIONS = [
  "Festival",
  "Project completion",
  "Team achievement",
  "Farewell",
  "Welcome party",
  "Random celebration",
  "Team outing",
] as const;

export type ApiSuccess<T> = { success: true; data: T; meta?: PaginationMeta };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
