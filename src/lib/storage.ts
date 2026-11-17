import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { storageRoot } from "@/config/env";
import { randomToken } from "@/lib/crypto";
import { badRequest } from "@/lib/errors";
import type { FileKind } from "@/types";

export const ALLOWED_MIME: Record<string, { ext: string; extensions: string[] }> = {
  "application/pdf": { ext: "pdf", extensions: ["pdf"] },
  "image/jpeg": { ext: "jpg", extensions: ["jpg", "jpeg"] },
  "image/png": { ext: "png", extensions: ["png"] },
  "image/webp": { ext: "webp", extensions: ["webp"] },
};

const KIND_DIR: Record<FileKind, string> = { bill: "bills", attachment: "attachments" };

/** Detects the real content type from magic bytes. Never trust the client-supplied MIME type. */
export function detectMime(buf: Uint8Array): string | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d)
    return "application/pdf"; // %PDF-
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return "image/png";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return "image/webp"; // RIFF....WEBP
  return null;
}

/** Strips directories, control characters and unsafe symbols. Display-only; never used as a path. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N} ._()\-]/gu, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return cleaned || "file";
}

export function extensionOf(name: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Validates the upload and returns its verified MIME type + storage extension. */
export function validateUpload(input: { buffer: Uint8Array; originalName: string; maxSize: number }) {
  if (input.buffer.length === 0) throw badRequest("File is empty");
  if (input.buffer.length > input.maxSize)
    throw badRequest(`File too large. Max ${Math.round(input.maxSize / 1024 / 1024)} MB`);
  const mime = detectMime(input.buffer);
  if (!mime || !ALLOWED_MIME[mime]) throw badRequest("Unsupported file type. Allowed: PDF, JPG, JPEG, PNG, WEBP");
  const ext = extensionOf(input.originalName);
  if (!ALLOWED_MIME[mime].extensions.includes(ext))
    throw badRequest("File extension does not match file contents");
  return { mime, ext: ALLOWED_MIME[mime].ext };
}

const KEY_RE = /^(bills|attachments)\/[a-f\d]{24}\/[a-f\d]{24}\.(pdf|jpg|png|webp)$/;

export function buildStorageKey(kind: FileKind, eventId: string, fileId: string, ext: string) {
  const key = `${KIND_DIR[kind]}/${eventId}/${fileId}.${ext}`;
  if (!KEY_RE.test(key)) throw badRequest("Invalid storage key");
  return key;
}

/**
 * Resolves a storage key to an absolute path and guarantees it stays inside the
 * storage root (path traversal protection). Throws for anything suspicious.
 */
export function resolveStorageKey(key: string): string {
  if (typeof key !== "string" || !KEY_RE.test(key)) throw badRequest("Invalid storage key");
  const root = storageRoot();
  const abs = path.resolve(root, key);
  if (!abs.startsWith(root + path.sep)) throw badRequest("Invalid storage key");
  return abs;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}

/** Writes atomically: temp file first, then rename into place. */
export async function writeStoredFile(key: string, data: Uint8Array) {
  const target = resolveStorageKey(key);
  const tempDir = path.join(storageRoot(), "temp");
  await ensureDir(tempDir);
  await ensureDir(path.dirname(target));
  const tmp = path.join(tempDir, `${randomToken(12)}.part`);
  try {
    await fs.writeFile(tmp, data, { mode: 0o600, flag: "wx" });
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export async function deleteStoredFile(key: string) {
  try {
    await fs.unlink(resolveStorageKey(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function deleteEventStorage(eventId: string) {
  if (!/^[a-f\d]{24}$/.test(eventId)) throw badRequest("Invalid event id");
  const root = storageRoot();
  for (const dir of Object.values(KIND_DIR)) {
    const abs = path.resolve(root, dir, eventId);
    if (!abs.startsWith(root + path.sep)) continue;
    await fs.rm(abs, { recursive: true, force: true });
  }
}

export async function statStoredFile(key: string) {
  try {
    return await fs.stat(resolveStorageKey(key));
  } catch {
    return null;
  }
}

export function storedFileWebStream(key: string): ReadableStream {
  const nodeStream = createReadStream(resolveStorageKey(key));
  return Readable.toWeb(nodeStream) as ReadableStream;
}

/** Removes orphaned temp uploads older than `maxAgeMs` (called by the worker). */
export async function cleanupTemp(maxAgeMs = 60 * 60 * 1000) {
  const tempDir = path.join(storageRoot(), "temp");
  let removed = 0;
  try {
    for (const name of await fs.readdir(tempDir)) {
      if (!name.endsWith(".part")) continue;
      const p = path.join(tempDir, name);
      const st = await fs.stat(p);
      if (Date.now() - st.mtimeMs > maxAgeMs) {
        await fs.rm(p, { force: true });
        removed++;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return removed;
}
