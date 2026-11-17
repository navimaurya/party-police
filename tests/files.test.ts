import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storageRoot } from "@/config/env";
import { PartyBill, PartyEvent } from "@/models";
import { connectDB, disconnectDB } from "@/lib/mongodb";
import { signFile, verifyFileSignature } from "@/lib/signed-url";
import { detectMime, resolveStorageKey, sanitizeFileName, validateUpload } from "@/lib/storage";
import { deleteBill, getFileForAccess, listBills, uploadBill } from "@/services/bill.service";
import { createEvent, deleteEvent } from "@/services/event.service";
import { CreateEventSchema } from "@/lib/validation";
import { baseEvent, makeAdmin } from "./helpers";

const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n% test bill\n%%EOF"));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function setup() {
  const actor = await makeAdmin();
  const event = await createEvent(CreateEventSchema.parse(baseEvent()), actor);
  return { actor, eventId: String(event._id) };
}

describe("upload validation", () => {
  it("detects real content types from magic bytes", () => {
    expect(detectMime(PDF)).toBe("application/pdf");
    expect(detectMime(PNG)).toBe("image/png");
    expect(detectMime(new Uint8Array(Buffer.from("<script>alert(1)</script>")))).toBeNull();
  });

  it("rejects disguised, oversized and mismatched files", () => {
    const html = new Uint8Array(Buffer.from("<html></html>"));
    expect(() => validateUpload({ buffer: html, originalName: "bill.pdf", maxSize: 1000 })).toThrow(/Unsupported/);
    expect(() => validateUpload({ buffer: PDF, originalName: "bill.png", maxSize: 1000 })).toThrow(/does not match/);
    expect(() => validateUpload({ buffer: PDF, originalName: "bill.pdf", maxSize: 5 })).toThrow(/too large/);
  });

  it("sanitizes file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\win.ini")).toBe("win.ini");
    expect(sanitizeFileName("bill<script>.pdf")).toBe("bill_script_.pdf");
  });
});

describe("path traversal protection", () => {
  it("rejects any key outside the strict storage-key format", () => {
    for (const key of [
      "../.env",
      "bills/../../.env",
      "/etc/passwd",
      "bills/aaaaaaaaaaaaaaaaaaaaaaaa/../../x.pdf",
      "bills/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbb.exe",
      "bills%2F..%2F..%2F.env",
    ]) {
      expect(() => resolveStorageKey(key), key).toThrow();
    }
    const ok = resolveStorageKey("bills/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbb.pdf");
    expect(ok.startsWith(storageRoot() + path.sep)).toBe(true);
  });

  it("rejects non-ObjectId file ids", async () => {
    await expect(getFileForAccess("../../.env")).rejects.toMatchObject({ status: 400 });
  });
});

describe("signed URLs", () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaa";

  it("accepts a valid signature for the intended file and op only", () => {
    const { exp, sig } = signFile(id, "view", 60);
    expect(verifyFileSignature(id, "view", String(exp), sig)).toBe(true);
    expect(verifyFileSignature(id, "download", String(exp), sig)).toBe(false);
    expect(verifyFileSignature("bbbbbbbbbbbbbbbbbbbbbbbb", "view", String(exp), sig)).toBe(false);
    expect(verifyFileSignature(id, "view", String(exp + 1000), sig)).toBe(false);
  });

  it("rejects expired signatures", () => {
    const past = Date.now() - 10 * 60_000;
    const { exp, sig } = signFile(id, "view", 60, past);
    expect(verifyFileSignature(id, "view", String(exp), sig)).toBe(false);
  });

  it("rejects missing or malformed parameters", () => {
    expect(verifyFileSignature(id, null, null, null)).toBe(false);
    expect(verifyFileSignature(id, "view", "abc", "x")).toBe(false);
  });
});

describe("bill storage lifecycle", () => {
  it("stores the binary on disk and only metadata in MongoDB, private by default", async () => {
    const { actor, eventId } = await setup();
    const bill = await uploadBill({ eventId, kind: "bill", amount: 1200, description: "Pizza", isPublic: false }, { buffer: PDF, originalName: "../receipt.pdf" }, actor);
    expect(bill).not.toHaveProperty("storageKey");
    const raw = await PartyBill.findById(bill!._id).select("+storageKey").lean();
    expect(raw!.storageKey).toBe(`bills/${eventId}/${String(bill!._id)}.pdf`);
    expect(raw!.originalFileName).toBe("receipt.pdf");
    expect(Object.keys(raw!)).not.toContain("data");
    const onDisk = await fs.readFile(path.join(storageRoot(), raw!.storageKey));
    expect(onDisk.toString()).toContain("%PDF");
    // Private bills are not listed publicly.
    expect((await listBills({ eventId, admin: false })).items).toHaveLength(0);
    expect((await listBills({ eventId, admin: true })).items).toHaveLength(1);
  });

  it("survives a database reconnect (application restart)", async () => {
    const { actor, eventId } = await setup();
    const bill = await uploadBill({ eventId, kind: "bill", amount: null, description: "", isPublic: true }, { buffer: PNG, originalName: "pic.png" }, actor);
    await disconnectDB();
    await connectDB();
    const found = await getFileForAccess(String(bill!._id));
    expect(found).not.toBeNull();
    await expect(fs.stat(path.join(storageRoot(), found!.bill.storageKey))).resolves.toBeTruthy();
  });

  it("deletes physical files when records are deleted", async () => {
    const { actor, eventId } = await setup();
    const b1 = await uploadBill({ eventId, kind: "bill", amount: null, description: "", isPublic: false }, { buffer: PDF, originalName: "a.pdf" }, actor);
    const b2 = await uploadBill({ eventId, kind: "attachment", amount: null, description: "", isPublic: true }, { buffer: PNG, originalName: "b.png" }, actor);
    const keys = (await PartyBill.find().select("+storageKey").lean()).map((b) => path.join(storageRoot(), b.storageKey));
    await deleteBill(String(b1!._id), actor);
    await expect(fs.stat(keys.find((k) => k.endsWith(".pdf"))!)).rejects.toThrow();
    await deleteEvent(eventId, actor);
    await expect(fs.stat(keys.find((k) => k.endsWith(".png"))!)).rejects.toThrow();
    expect(await PartyBill.countDocuments()).toBe(0);
    expect(await PartyEvent.countDocuments()).toBe(0);
    void b2;
  });
});
