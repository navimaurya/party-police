import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/config/env";

let transporter: Transporter | null = null;

/**
 * SMTP transport configured from env. Set SMTP_HOST=console in development to
 * print emails to the server log instead of sending them.
 */
/** TLS mode: explicit SMTP_SECURE wins, otherwise port 465 means implicit TLS. */
export function smtpSecure() {
  const e = env();
  return e.SMTP_SECURE ?? e.SMTP_PORT === 465;
}

export function getTransport(): Transporter {
  if (transporter) return transporter;
  const e = env();
  if (!e.SMTP_HOST) throw new Error("SMTP is not configured (SMTP_HOST is empty)");
  if (e.SMTP_HOST === "console") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      // 465 = TLS from the start; 587/25 = STARTTLS upgrade.
      secure: smtpSecure(),
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      // A fresh connection per email. Party email volume is low, and a pooled connection
      // that the server silently dropped would otherwise fail every following send.
      pool: false,
      connectionTimeout: 20_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
  }
  return transporter;
}

export type OutgoingEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  /** Visible copy recipients. When set, `to` is visible too (used for one-to-one threads). */
  cc?: string[];
  /** Email threading: our own Message-ID plus the message this one replies to. */
  thread?: { messageId?: string; inReplyTo?: string; references?: string[] };
  /** Inline images referenced from the HTML as `cid:<cid>` (e.g. a UPI QR code). */
  attachments?: EmailAttachment[];
};

export type EmailAttachment = { filename: string; content: Buffer; contentType: string; cid: string };

/**
 * Domain for Message-IDs: the sender's own domain (from SMTP_FROM). A made-up domain
 * is a spam signal, and Gmail and others may bin or silently drop such mail.
 */
function messageIdDomain() {
  const from = env().SMTP_FROM;
  const addr = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
  const domain = addr.split("@")[1]?.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (domain && domain.includes(".")) return domain;
  try {
    return new URL(env().APP_URL).hostname || "party-police.invalid";
  } catch {
    return "party-police.invalid";
  }
}

/** Deterministic Message-ID, so retries and replies can reference it. */
export function messageIdFor(key: string) {
  return `<${key.replace(/[^a-zA-Z0-9.-]/g, ".")}@${messageIdDomain()}>`;
}

export type SendResult = { messageId: string; accepted: string[]; rejected: string[]; response: string };

/** Network-level failures (timeouts, no greeting, dropped socket): retry with a fresh transport. */
export function isConnectionError(err: unknown) {
  const code = String((err as { code?: string }).code ?? "");
  const msg = String((err as Error)?.message ?? "");
  return ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNRESET", "ECONNREFUSED", "EDNS"].includes(code) || /greeting never received|timeout|socket/i.test(msg);
}

/** Drops the cached transport (e.g. after a connection failure) so the next send reconnects. */
export function resetTransport() {
  try {
    transporter?.close();
  } catch {
    /* already closed */
  }
  transporter = null;
}

/** Errors that will not succeed on retry (bad recipient, auth config). */
export function isPermanentSmtpError(err: unknown) {
  const code = (err as { responseCode?: number }).responseCode;
  return typeof code === "number" && code >= 500 && code < 600 && code !== 554 && code !== 552;
}

export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const e = env();
  const t = getTransport();
  // Broadcasts go out as BCC so members don't see each other's addresses.
  const visible = msg.to.length === 1 || (msg.cc?.length ?? 0) > 0;
  let info: { messageId?: string; accepted?: unknown; rejected?: unknown; response?: string };
  try {
    info = await t.sendMail({
      from: e.SMTP_FROM,
      to: visible ? msg.to : e.SMTP_FROM,
      cc: msg.cc?.length ? msg.cc : undefined,
      bcc: visible ? undefined : msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      // Deterministic, so downstream systems can dedupe and replies can thread.
      messageId: msg.thread?.messageId ?? messageIdFor(msg.idempotencyKey),
      inReplyTo: msg.thread?.inReplyTo,
      references: msg.thread?.references,
      headers: { "X-Party-Police-Key": msg.idempotencyKey },
      attachments: msg.attachments?.map((a) => ({ ...a, contentDisposition: "inline" as const })),
    });
  } catch (err) {
    if (isConnectionError(err)) {
      resetTransport();
      throw Object.assign(err as Error, {
        message: `Could not reach the mail server ${e.SMTP_HOST}:${e.SMTP_PORT} (${(err as Error).message}). Will retry.`,
      });
    }
    throw err;
  }
  if (e.SMTP_HOST === "console") {
    const cc = msg.cc?.length ? ` cc=${msg.cc.join(",")}` : "";
    const reply = msg.thread?.inReplyTo ? ` in-reply-to=${msg.thread.inReplyTo}` : "";
    console.info(`[email:console] to=${msg.to.join(",")}${cc}${reply} subject="${msg.subject}"\n${msg.text}`);
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String((x as { address?: string }).address ?? x))) : []);
  const accepted = list(info.accepted);
  const rejected = list(info.rejected);
  // The SMTP server refused every recipient: that's a failure, not a send.
  if (e.SMTP_HOST !== "console" && accepted.length === 0 && rejected.length > 0) {
    throw Object.assign(new Error(`SMTP server rejected all recipients: ${rejected.join(", ")} (${String(info.response ?? "")})`), { responseCode: 550 });
  }
  return { messageId: String(info.messageId ?? ""), accepted, rejected, response: String(info.response ?? "").slice(0, 300) };
}

/** Test hook. */
export function setTransportForTests(t: Transporter | null) {
  transporter = t;
}
