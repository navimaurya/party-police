import crypto from "node:crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmac(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
