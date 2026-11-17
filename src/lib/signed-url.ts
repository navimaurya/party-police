import { env } from "@/config/env";
import { hmac, safeEqual } from "@/lib/crypto";

export type FileOp = "view" | "download";
export const MAX_SIGNED_TTL_SECONDS = 7 * 24 * 3600;

function payload(fileId: string, op: FileOp, exp: number) {
  return `v1|file|${fileId}|${op}|${exp}`;
}

/** Creates a short-lived signature bound to a single file + operation. */
export function signFile(fileId: string, op: FileOp, ttlSeconds: number, now = Date.now()) {
  const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_SIGNED_TTL_SECONDS);
  const exp = Math.floor(now / 1000) + ttl;
  const sig = hmac(env().FILE_SIGNING_SECRET, payload(fileId, op, exp));
  return { exp, sig };
}

export function signedFileUrl(fileId: string, op: FileOp, ttlSeconds: number) {
  const { exp, sig } = signFile(fileId, op, ttlSeconds);
  const url = new URL(`/api/files/${fileId}`, env().APP_URL);
  url.searchParams.set("op", op);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return { url: url.toString(), expiresAt: new Date(exp * 1000) };
}

export function publicFileUrl(fileId: string, op: FileOp = "view") {
  const url = new URL(`/api/files/${fileId}`, env().APP_URL);
  if (op === "download") url.searchParams.set("op", "download");
  return url.toString();
}

export function verifyFileSignature(
  fileId: string,
  op: string | null,
  exp: string | null,
  sig: string | null,
  now = Date.now()
): boolean {
  if (!op || !exp || !sig) return false;
  if (op !== "view" && op !== "download") return false;
  if (!/^\d{1,12}$/.test(exp) || !/^[A-Za-z0-9_-]{20,100}$/.test(sig)) return false;
  const expNum = Number(exp);
  const nowSec = Math.floor(now / 1000);
  if (expNum <= nowSec) return false; // expired
  if (expNum > nowSec + MAX_SIGNED_TTL_SECONDS) return false; // forged far-future expiry
  const expected = hmac(env().FILE_SIGNING_SECRET, payload(fileId, op, expNum));
  return safeEqual(expected, sig);
}
