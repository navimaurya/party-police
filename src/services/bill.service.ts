import { Types } from "mongoose";
import type { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { PartyBill, PartyEvent } from "@/models";
import { notFound } from "@/lib/errors";
import { assertObjectId } from "@/lib/utils-server";
import { buildStorageKey, deleteStoredFile, sanitizeFileName, validateUpload, writeStoredFile } from "@/lib/storage";
import { env } from "@/config/env";
import type { BillMetaSchema, BillUpdateSchema } from "@/lib/validation";
import { audit } from "./audit.service";
import { mongoSort, parseSort, TEXT_COLLATION } from "@/lib/sort";
import { BILL_DEFAULT_SORT, BILL_SORT_FIELDS } from "@/lib/sort-fields";

type BillMeta = z.infer<typeof BillMetaSchema>;

/** Public projection: never includes storageKey or any filesystem detail. */
const PUBLIC_FIELDS = { eventId: 1, kind: 1, originalFileName: 1, mimeType: 1, fileSize: 1, amount: 1, description: 1, isPublic: 1, uploadedAt: 1 };

export async function uploadBill(meta: BillMeta, file: { buffer: Uint8Array; originalName: string }, actorId: string) {
  await connectDB();
  const eventId = assertObjectId(meta.eventId, "event id");
  if (!(await PartyEvent.exists({ _id: eventId }))) throw notFound("Party not found");

  const { mime, ext } = validateUpload({ buffer: file.buffer, originalName: file.originalName, maxSize: env().MAX_FILE_SIZE });
  const fileId = new Types.ObjectId();
  const storageKey = buildStorageKey(meta.kind, String(eventId), String(fileId), ext);

  await writeStoredFile(storageKey, file.buffer);
  try {
    await PartyBill.create({
      _id: fileId,
      eventId,
      kind: meta.kind,
      originalFileName: sanitizeFileName(file.originalName),
      storageKey,
      mimeType: mime,
      fileSize: file.buffer.length,
      amount: meta.amount,
      description: meta.description,
      isPublic: meta.isPublic,
      uploadedAt: new Date(),
    });
  } catch (err) {
    // Never leave orphaned files on disk when the metadata write fails.
    await deleteStoredFile(storageKey).catch(() => undefined);
    throw err;
  }
  await audit({ action: "bill.upload", entityType: "PartyBill", entityId: String(fileId), actorId, newValue: { eventId: meta.eventId, name: file.originalName, size: file.buffer.length, isPublic: meta.isPublic } });
  return PartyBill.findById(fileId).select(PUBLIC_FIELDS).lean();
}

export async function listBills(opts: { eventId?: string; admin: boolean; page?: number; limit?: number; sort?: string }) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.eventId) filter.eventId = assertObjectId(opts.eventId, "event id");
  if (!opts.admin) filter.isPublic = true;
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const [items, total] = await Promise.all([
    PartyBill.find(filter)
      .select(PUBLIC_FIELDS)
      .sort(mongoSort(parseSort(opts.sort, BILL_SORT_FIELDS, BILL_DEFAULT_SORT), { uploadedAt: -1, _id: 1 }))
      .collation(TEXT_COLLATION)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("eventId", "title eventDate publicVisibility")
      .lean(),
    PartyBill.countDocuments(filter),
  ]);
  // Public visitors only see files of events that are themselves public.
  const visible = opts.admin
    ? items
    : items.filter((b) => (b.eventId as unknown as { publicVisibility?: boolean } | null)?.publicVisibility);
  return { items: visible, total };
}

export async function updateBill(id: string, input: z.infer<typeof BillUpdateSchema>, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id, "file id");
  const before = await PartyBill.findById(_id).select(PUBLIC_FIELDS).lean();
  if (!before) throw notFound("File not found");
  const after = await PartyBill.findByIdAndUpdate(_id, { $set: input }, { returnDocument: "after", runValidators: true })
    .select(PUBLIC_FIELDS)
    .lean();
  await audit({ action: "bill.update", entityType: "PartyBill", entityId: id, actorId, previousValue: before, newValue: after });
  return after!;
}

export async function deleteBill(id: string, actorId: string) {
  await connectDB();
  const _id = assertObjectId(id, "file id");
  const bill = await PartyBill.findById(_id).select("+storageKey").lean();
  if (!bill) throw notFound("File not found");
  await PartyBill.deleteOne({ _id });
  await deleteStoredFile(bill.storageKey).catch((err) => console.error("[storage] delete failed", err));
  await audit({ action: "bill.delete", entityType: "PartyBill", entityId: id, actorId, previousValue: { ...bill, storageKey: undefined } });
}

/** Loads a file record plus its event for access control. Internal use only (includes storageKey). */
export async function getFileForAccess(id: string) {
  await connectDB();
  const _id = assertObjectId(id, "file id");
  const bill = await PartyBill.findById(_id).select("+storageKey").lean();
  if (!bill) return null;
  const event = await PartyEvent.findById(bill.eventId).select({ publicVisibility: 1 }).lean();
  if (!event) return null; // file must belong to an existing event
  return { bill, event };
}
