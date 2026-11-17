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
};

export const USER_ROLES = ["super_admin", "admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can be given through the app. There is exactly one Super Admin, set from env. */
export const ASSIGNABLE_ROLES = ["member", "admin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Roles that can sign in to the admin panel. */
export type AdminRole = "super_admin" | "admin";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
};

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
