import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { NOTIFICATION_TYPES } from "@/types";

const notificationTypesDefault = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { type: Boolean, default: true }]));

/** Singleton settings document (key = "global"). */
const AppSettingsSchema = new Schema(
  {
    key: { type: String, default: "global", unique: true },
    notificationEnabled: { type: Boolean, default: true },
    notificationTypes: notificationTypesDefault,
    /** Everyone who receives party emails (team DL, members...). */
    recipients: { type: [String], default: [] },
    /** Hours before an event at which reminders are sent. */
    reminderIntervals: { type: [Number], default: [24, 2] },
    defaultReminderSettings: {
      defaulterReminderEveryDays: { type: Number, default: 7 },
      overdueNoticeAfterDays: { type: Number, default: 1 },
      sendToEventParticipants: { type: Boolean, default: true },
    },
    budgetSettings: {
      validationEnabled: { type: Boolean, default: true },
    },
    thankYou: {
      includeBillLinks: { type: Boolean, default: true },
      includePrivateBillLinks: { type: Boolean, default: false },
      privateLinkTtlHours: { type: Number, default: 72 },
    },
    currency: { type: String, default: "INR" },
    /** Daily party-day emails (members, giver, Super Admin). Hour is in APP_TIMEZONE. */
    partyDay: {
      sendAtHour: { type: Number, default: 9, min: 0, max: 23 },
    },
  },
  { timestamps: true }
);

export type AppSettingsDoc = InferSchemaType<typeof AppSettingsSchema>;
export const AppSettings: Model<AppSettingsDoc> =
  (models.AppSettings as Model<AppSettingsDoc>) || model<AppSettingsDoc>("AppSettings", AppSettingsSchema);
