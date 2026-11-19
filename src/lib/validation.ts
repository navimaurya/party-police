import { z } from "zod";
import {
  COMMITMENT_STATUSES,
  DISCOUNT_TYPES,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_TYPES,
  FILE_KINDS,
  ASSIGNABLE_ROLES,
  USER_ROLES,
  NOTIFICATION_TYPES,
  OCCASION_TYPES,
  RELATIONS,
} from "@/types";

const trimmed = (max: number) => z.string().trim().max(max);
/** "" or null clears the value; omitted leaves it unchanged. */
const optionalEmail = z
  .union([z.email().max(200), z.literal(""), z.null()])
  .transform((v) => (v ? v.toLowerCase() : null))
  .optional();

const isoDate = z.coerce.date({ error: "Invalid date" });
const nullableDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v instanceof Date ? v : v === undefined ? undefined : null));

/** "yyyy-MM-dd": a calendar day without a time. */
export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Party date. Parties are scheduled by day (no time): a "yyyy-MM-dd" string is kept as is
 * and turned into an instant in APP_TIMEZONE by the event service. Full timestamps still work.
 */
const eventDateInput = z.union([z.string().regex(DAY_KEY_RE, "Invalid date"), isoDate]);

export const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const LoginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

export const ParticipantSchema = z.object({
  name: trimmed(100).min(1),
  email: optionalEmail,
});

export const NotificationPrefsSchema = z.object({
  reminders: z.boolean().default(true),
  announcement: z.boolean().default(true),
  updates: z.boolean().default(true),
  thankYou: z.boolean().default(true),
  includeBillLinks: z.boolean().default(true),
});

export const BudgetOverrideSchema = z.object({
  reason: trimmed(500).default(""),
});

const eventBase = {
  title: trimmed(200).min(1, "Title is required"),
  eventType: z.enum(EVENT_TYPES).default("scheduled"),
  category: z.enum(EVENT_CATEGORIES).default("monthly"),
  organizerName: trimmed(100).min(1, "Organizer is required"),
  organizerEmail: optionalEmail,
  occasion: trimmed(200).default(""),
  description: trimmed(5000).default(""),
  location: trimmed(300).default(""),
  eventDate: eventDateInput.optional(),
  participants: z.array(ParticipantSchema).max(500).default([]),
  budget: z.number().nonnegative().max(100_000_000).nullable().optional(),
  currency: z.string().length(3).toUpperCase().default("INR"),
  notificationPreferences: NotificationPrefsSchema.optional(),
  publicVisibility: z.boolean().default(true),
  /** Admin override for out-of-range budgets. Presence = override intent. */
  budgetOverride: BudgetOverrideSchema.optional(),
};

export const CreateEventSchema = z
  .object({ ...eventBase, status: z.enum(EVENT_STATUSES).default("upcoming") })
  .refine((v) => v.eventType === "instant" || v.eventDate !== undefined, {
    message: "Event date is required for scheduled parties",
    path: ["eventDate"],
  });

export const UpdateEventSchema = z
  .object({
    title: eventBase.title.optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    organizerName: eventBase.organizerName.optional(),
    organizerEmail: optionalEmail,
    occasion: trimmed(200).optional(),
    description: trimmed(5000).optional(),
    location: trimmed(300).optional(),
    eventDate: eventDateInput.optional(),
    participants: z.array(ParticipantSchema).max(500).optional(),
    budget: eventBase.budget,
    currency: z.string().length(3).toUpperCase().optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    notificationPreferences: NotificationPrefsSchema.partial().optional(),
    publicVisibility: z.boolean().optional(),
    budgetOverride: BudgetOverrideSchema.optional(),
  })
  .strict();

export const EventStatusSchema = z.object({ status: z.enum(EVENT_STATUSES) });

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(50).optional(),
  q: z.string().trim().max(100).optional(),
});

export const EventListQuerySchema = ListQuerySchema.extend({
  category: z.enum(EVENT_CATEGORIES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Validated against EVENT_SORT_FIELDS in the service; unknown values fall back to the default. */
  sort: z.string().max(50).optional(),
});

export const CalendarQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const CommitmentCreateSchema = z.object({
  personName: trimmed(100).min(1),
  personEmail: optionalEmail,
  reason: trimmed(300).min(1),
  commitmentDate: isoDate,
  dueDate: isoDate,
  status: z.enum(COMMITMENT_STATUSES).default("pending"),
  relatedEventId: objectIdString.nullable().optional(),
  notes: trimmed(1000).default(""),
  isPublic: z.boolean().default(true),
});

export const CommitmentUpdateSchema = z
  .object({
    personName: trimmed(100).min(1).optional(),
    personEmail: optionalEmail,
    reason: trimmed(300).min(1).optional(),
    commitmentDate: isoDate.optional(),
    dueDate: isoDate.optional(),
    status: z.enum(COMMITMENT_STATUSES).optional(),
    relatedEventId: objectIdString.nullable().optional(),
    notes: trimmed(1000).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();

export const CommitmentListQuerySchema = ListQuerySchema.extend({
  status: z.enum(COMMITMENT_STATUSES).optional(),
  overdue: z.enum(["true", "false"]).optional(),
});

const discountShape = {
  title: trimmed(200).min(1),
  description: trimmed(2000).default(""),
  code: trimmed(50).toUpperCase().default(""),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.number().positive(),
  applicableVenue: trimmed(300).default(""),
  applicableCategories: z.array(z.enum(EVENT_CATEGORIES)).default([]),
  validFrom: nullableDate,
  validUntil: nullableDate,
  termsAndConditions: trimmed(3000).default(""),
  isActive: z.boolean().default(true),
};

const discountRefine = <T extends { discountType?: string; discountValue?: number; validFrom?: Date | null; validUntil?: Date | null }>(
  v: T,
  ctx: z.RefinementCtx
) => {
  if (v.discountType === "percentage" && v.discountValue !== undefined && v.discountValue > 100) {
    ctx.addIssue({ code: "custom", message: "Percentage cannot exceed 100", path: ["discountValue"] });
  }
  if (v.validFrom && v.validUntil && v.validFrom > v.validUntil) {
    ctx.addIssue({ code: "custom", message: "Valid until must be after valid from", path: ["validUntil"] });
  }
};

export const DiscountCreateSchema = z.object(discountShape).superRefine(discountRefine);
export const DiscountUpdateSchema = z
  .object({
    title: discountShape.title.optional(),
    description: trimmed(2000).optional(),
    code: trimmed(50).toUpperCase().optional(),
    discountType: z.enum(DISCOUNT_TYPES).optional(),
    discountValue: z.number().positive().optional(),
    applicableVenue: trimmed(300).optional(),
    applicableCategories: z.array(z.enum(EVENT_CATEGORIES)).optional(),
    validFrom: nullableDate,
    validUntil: nullableDate,
    termsAndConditions: trimmed(3000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine(discountRefine);

export const BudgetSettingItemSchema = z
  .object({
    category: z.enum(EVENT_CATEGORIES),
    minimumBudget: z.number().positive().nullable().optional(),
    maximumBudget: z.number().positive().nullable().optional(),
    noMinimum: z.boolean().default(false),
    noMaximum: z.boolean().default(false),
    currency: z.string().length(3).toUpperCase().default("INR"),
    isEnabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (!v.noMinimum && (v.minimumBudget === null || v.minimumBudget === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Minimum budget is required unless explicitly marked as no minimum",
        path: ["minimumBudget"],
      });
    }
    if (!v.noMaximum && (v.maximumBudget === null || v.maximumBudget === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Maximum budget is required unless explicitly marked as unlimited",
        path: ["maximumBudget"],
      });
    }
    if (!v.noMinimum && !v.noMaximum && v.minimumBudget && v.maximumBudget && v.minimumBudget > v.maximumBudget) {
      ctx.addIssue({ code: "custom", message: "Minimum cannot exceed maximum", path: ["maximumBudget"] });
    }
  });

export const BudgetSettingsUpdateSchema = z.object({
  validationEnabled: z.boolean().optional(),
  categories: z.array(BudgetSettingItemSchema).max(EVENT_CATEGORIES.length).optional(),
});

export const BillMetaSchema = z.object({
  eventId: objectIdString,
  kind: z.enum(FILE_KINDS).default("bill"),
  amount: z
    .union([z.coerce.number().nonnegative(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  description: trimmed(1000).default(""),
  isPublic: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(false)
    .transform((v) => v === true || v === "true"),
});

export const BillUpdateSchema = z
  .object({
    amount: z.number().nonnegative().nullable().optional(),
    description: trimmed(1000).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();

export const SignFileSchema = z.object({
  fileId: objectIdString,
  op: z.enum(["view", "download"]).default("view"),
  ttlSeconds: z.number().int().min(30).max(7 * 24 * 3600).default(15 * 60),
});

const notificationTypesShape = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, z.boolean().optional()])) as Record<
  (typeof NOTIFICATION_TYPES)[number],
  z.ZodOptional<z.ZodBoolean>
>;

export const SettingsUpdateSchema = z
  .object({
    notificationEnabled: z.boolean().optional(),
    notificationTypes: z.object(notificationTypesShape).optional(),
    recipients: z.array(z.email().max(200)).max(500).optional(),
    reminderIntervals: z.array(z.number().int().min(1).max(24 * 30)).max(10).optional(),
    defaultReminderSettings: z
      .object({
        defaulterReminderEveryDays: z.number().int().min(1).max(90).optional(),
        overdueNoticeAfterDays: z.number().int().min(0).max(90).optional(),
        sendToEventParticipants: z.boolean().optional(),
      })
      .optional(),
    thankYou: z
      .object({
        includeBillLinks: z.boolean().optional(),
        includePrivateBillLinks: z.boolean().optional(),
        privateLinkTtlHours: z.number().int().min(1).max(24 * 7).optional(),
      })
      .optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    partyDay: z.object({ sendAtHour: z.number().int().min(0).max(23).optional() }).optional(),
  })
  .strict();

export const TestEmailSchema = z.object({ to: z.email() });

/* --------------------------------- users --------------------------------- */

const password = z.string().min(10, "Password must be at least 10 characters").max(200);

export const OccasionSchema = z
  .object({
    personName: trimmed(100).min(1, "Name is required"),
    relation: z.enum(RELATIONS).default("Self"),
    occasion: z.enum(OCCASION_TYPES).default("Birthday"),
    label: trimmed(100).default(""),
    date: isoDate,
  })
  .strict();

const profileFields = {
  name: trimmed(100).min(1, "Name is required"),
  phone: trimmed(30).optional(),
  department: trimmed(100).optional(),
  designation: trimmed(100).optional(),
  birthday: nullableDate,
  joinedOn: nullableDate,
  /** Relatives' (and other) occasions. Replaces the whole list when sent. */
  occasions: z.array(OccasionSchema).max(50).optional(),
};

export const UserCreateSchema = z
  .object({
    email: z.email().max(200).transform((v) => v.toLowerCase()),
    ...profileFields,
    notes: trimmed(1000).optional(),
    role: z.enum(ASSIGNABLE_ROLES).default("member"),
    isActive: z.boolean().optional(),
    /**
     * Optional sign-in password. Without one, the user is emailed their username and a
     * one-time password right after the welcome email.
     */
    password: password.optional(),
  })
  .strict();

/** Email is the user's key and cannot be changed. */
export const UserUpdateSchema = z
  .object({
    ...profileFields,
    name: profileFields.name.optional(),
    notes: trimmed(1000).optional(),
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    isActive: z.boolean().optional(),
    /** Super Admin only: a one-time password. The user must replace it after signing in. */
    password: password.optional(),
  })
  .strict();

export const UserListQuerySchema = ListQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

/** What a signed-in user may change about themselves. */
export const ProfileUpdateSchema = z.object({ ...profileFields, name: profileFields.name.optional() }).strict();

export const CredentialsSendSchema = z
  .object({
    /** One user, or every active user who can't sign in yet. */
    userId: objectIdString.optional(),
    allWithoutPassword: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !!v.userId !== !!v.allWithoutPassword, { message: "Pass either userId or allWithoutPassword" });

export const ChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, { path: ["newPassword"], message: "Choose a different password" });
