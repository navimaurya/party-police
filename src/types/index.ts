export const EVENT_CATEGORIES = ["monthly", "special", "occasional", "contri"] as const;
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
  contri: "Contri Party",
};

export const CATEGORY_EMOJI: Record<EventCategory, string> = {
  monthly: "🍕",
  special: "🎂",
  occasional: "🎊",
  contri: "🤝",
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

export const CONTRI_OCCASIONS = ["Team lunch", "Team dinner", "Cake for someone", "Gift for someone", "Outing", "Pizza Friday"] as const;

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

/* ------------------------------ party payments ------------------------------ */

/**
 * How a party is paid for.
 * - standard: the existing behaviour (the giver pays; contri parties use the contri split).
 * - lender_provider: lenders front the money, providers collect it back; tracked per obligation.
 */
export const PAYMENT_MODELS = ["standard", "lender_provider"] as const;
export type PaymentModel = (typeof PAYMENT_MODELS)[number];
export const PAYMENT_MODEL_LABELS: Record<PaymentModel, string> = {
  standard: "Standard / contribution",
  lender_provider: "Money givers & providers",
};

/**
 * People with a money job on a lender/provider party.
 * - lender ("money giver"): a team member the party giver borrowed money from, to be repaid;
 * - provider: someone who collects payments from participants.
 */
export const MONEY_ROLES = ["lender", "provider"] as const;
export type MoneyRole = (typeof MONEY_ROLES)[number];
export const MONEY_ROLE_LABELS: Record<MoneyRole, string> = { lender: "Money giver", provider: "Provider (collector)" };

/**
 * One payment obligation.
 * - share: a participant's assigned share (paid to the giver, a provider or a money giver);
 * - lend:  money the party giver borrowed from a money giver, which the giver repays;
 * - other: any other money someone owes on this party (e.g. a provider settling with a money giver).
 */
export const PAYMENT_KINDS = ["share", "lend", "other"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = { share: "Share", lend: "Borrowed money", other: "Other" };

/** Stored status, derived from the amounts on every change. */
export const PAYMENT_STATUSES = ["pending", "partially_paid", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/** Shown status: "overdue" = not fully paid after the due date (computed when read). */
export const PAYMENT_VIEW_STATUSES = [...PAYMENT_STATUSES, "overdue"] as const;
export type PaymentViewStatus = (typeof PAYMENT_VIEW_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentViewStatus, string> = {
  pending: "Pending",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
};

export const PAYMENT_METHODS = ["upi", "cash", "bank_transfer", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};
