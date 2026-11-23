import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { EVENT_CATEGORIES, EVENT_STATUSES, EVENT_TYPES } from "@/types";

const ParticipantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
  },
  { _id: false }
);

const PartyEventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    eventType: { type: String, enum: EVENT_TYPES, required: true, default: "scheduled" },
    category: { type: String, enum: EVENT_CATEGORIES, required: true, default: "monthly" },
    organizerName: { type: String, required: true, trim: true, maxlength: 100 },
    organizerEmail: { type: String, trim: true, lowercase: true, maxlength: 200 },
    occasion: { type: String, trim: true, maxlength: 200, default: "" },
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    location: { type: String, trim: true, maxlength: 300, default: "" },
    eventDate: { type: Date, required: true },
    participants: { type: [ParticipantSchema], default: [] },
    budget: { type: Number, min: 0, default: null },
    /**
     * Contri party: the host paid the bill, everyone splits it and pays the host back.
     * Only used when category is "contri".
     */
    contri: {
      /** What the host actually paid. Falls back to `budget` when empty. */
      totalAmount: { type: Number, min: 0, default: null },
      /** People splitting the bill (host included). Empty = participants + host. */
      splitCount: { type: Number, min: 1, default: null },
      /** Host's UPI ID for this party. Empty = the host's UPI ID from their profile. */
      upiId: { type: String, trim: true, maxlength: 100, default: "" },
    },
    currency: { type: String, default: "INR", maxlength: 3 },
    status: { type: String, enum: EVENT_STATUSES, default: "upcoming" },
    completedAt: { type: Date, default: null },
    /** A party is completed only when an admin approves it. */
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedByEmail: { type: String, default: "" },
    /** The party giver (or a manager) said the party was given and asked for approval. */
    approvalRequestedAt: { type: Date, default: null },
    approvalRequestedByEmail: { type: String, default: "" },
    /** Email thread used for the party-day confirmation (giver, Super Admin, thanks). */
    confirmationThread: {
      dayKey: { type: String, default: "" },
      subject: { type: String, default: "" },
    },
    /** Incremented every time the event transitions INTO "completed". */
    completionVersion: { type: Number, default: 0 },
    /** Incremented on every meaningful edit; used to dedupe "event updated" emails. */
    revision: { type: Number, default: 0 },
    notificationPreferences: {
      reminders: { type: Boolean, default: true },
      announcement: { type: Boolean, default: true },
      updates: { type: Boolean, default: true },
      thankYou: { type: Boolean, default: true },
      includeBillLinks: { type: Boolean, default: true },
    },
    publicVisibility: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PartyEventSchema.index({ eventDate: 1 });
PartyEventSchema.index({ status: 1, eventDate: 1 });
PartyEventSchema.index({ category: 1, eventDate: -1 });
PartyEventSchema.index({ eventType: 1, status: 1, createdAt: -1 });
PartyEventSchema.index({ publicVisibility: 1, status: 1, eventDate: 1 });
PartyEventSchema.index({ organizerName: 1 });
PartyEventSchema.index({ organizerEmail: 1, eventDate: -1 });

export type PartyEventDoc = InferSchemaType<typeof PartyEventSchema>;
export const PartyEvent: Model<PartyEventDoc> =
  (models.PartyEvent as Model<PartyEventDoc>) || model<PartyEventDoc>("PartyEvent", PartyEventSchema);
