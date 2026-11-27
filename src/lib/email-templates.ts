import { env } from "@/config/env";
import { formatInZone } from "@/lib/time";
import type { UserRole } from "@/types";

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ */
/* Theme: mirrors the website (pink primary, violet + amber accents,   */
/* Fredoka headings, soft pink background, big rounded cards).         */
/* Inline styles + tables so it renders in Gmail, Outlook and Apple.   */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#fdf2f8",
  card: "#ffffff",
  border: "#fbcfe8",
  primary: "#e6377f",
  primaryDark: "#be185d",
  violet: "#7c3aed",
  ink: "#1f1b2e",
  muted: "#6b6478",
  soft: "#fdf2f8",
};
const HEADING_FONT = "'Fredoka','Arial Rounded MT Bold','Trebuchet MS',Arial,sans-serif";
const BODY_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * All dates in emails are shown in the team's timezone (APP_TIMEZONE), not the server's.
 * Parties are scheduled by day, so party dates have no time.
 */
const fmtDate = (d: Date | string) => formatInZone(d, "EEE, d MMM yyyy");
const fmtDateTime = (d: Date | string) => formatInZone(d, "EEE, d MMM yyyy 'at' h:mm a");
const fmtDay = (d: Date | string) => formatInZone(d, "d MMM yyyy");

type Layout = {
  /** Small pill above the title, e.g. "Party day". */
  eyebrow: string;
  title: string;
  /** Hidden inbox preview line. */
  preheader?: string;
  body: string;
  cta?: { label: string; url: string };
  signoff?: string;
};

function layout({ eyebrow, title, preheader, body, cta, signoff = "The Official Party Committee 🥳" }: Layout) {
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr><td style="border-radius:999px;background:${C.primary}">
<a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 26px;border-radius:999px;font:600 15px ${BODY_FONT};color:#ffffff;text-decoration:none">${escapeHtml(cta.label)} &rarr;</a>
</td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader ?? title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

<tr><td style="padding:0 6px 14px;font:700 18px ${HEADING_FONT};color:${C.ink}">
🚨 Party <span style="color:${C.primary}">Police</span>
</td></tr>

<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:28px;overflow:hidden">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:30px 30px 22px;background:#fce7f3;background-image:linear-gradient(135deg,#fce7f3 0%,#ffffff 55%,#fef3c7 100%);border-radius:28px 28px 0 0">
    <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#ffffff;border:1px solid ${C.border};font:600 11px ${BODY_FONT};letter-spacing:.08em;text-transform:uppercase;color:${C.primary}">${escapeHtml(eyebrow)}</span>
    <h1 style="margin:14px 0 0;font:700 26px/1.25 ${HEADING_FONT};color:${C.ink}">${escapeHtml(title)}</h1>
  </td></tr>
  <tr><td style="padding:22px 30px 30px;font:400 15px/1.65 ${BODY_FONT};color:${C.ink}">
    ${body}${ctaHtml}
    <p style="margin:28px 0 0;color:${C.muted}">Regards,<br><strong style="font-family:${HEADING_FONT};font-size:16px;color:${C.ink}">${escapeHtml(signoff)}</strong></p>
  </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:18px 10px 0;font:500 13px ${HEADING_FONT};color:${C.primaryDark}">
Life is short. Salaries are temporary. Parties are mandatory!
</td></tr>
<tr><td align="center" style="padding:6px 10px 0;font:400 11px ${BODY_FONT};color:#a39cb0">
You are receiving this because you are a Party Police member.
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 12px">${t}</p>`;
const strong = (t: unknown) => `<strong>${escapeHtml(t)}</strong>`;

/** Soft pink info card, like the cards on the website. */
const details = (rows: [string, string | null | undefined][]) => {
  const visible = rows.filter(([, v]) => v);
  if (!visible.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${C.soft};border:1px solid ${C.border};border-radius:18px">
<tr><td style="padding:14px 18px">
<table role="presentation" cellpadding="0" cellspacing="0" style="font:400 14px/1.5 ${BODY_FONT}">
${visible
  .map(([k, v]) => `<tr><td style="padding:5px 16px 5px 0;color:${C.muted};white-space:nowrap;vertical-align:top">${k}</td><td style="padding:5px 0;color:${C.ink};font-weight:600">${escapeHtml(v)}</td></tr>`)
  .join("")}
</table></td></tr></table>`;
};

/** Highlighted callout (violet), for the one thing the reader must do. */
const callout = (html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:18px"><tr><td style="padding:14px 18px;font:500 14px/1.6 ${BODY_FONT};color:#4c1d95">${html}</td></tr></table>`;

type EventLike = {
  _id: unknown;
  title: string;
  organizerName: string;
  occasion?: string | null;
  location?: string | null;
  eventDate: Date | string;
  description?: string | null;
};

const appUrl = () => env().APP_URL;
const eventUrl = (e: EventLike) => `${appUrl()}/parties/${String(e._id)}`;
const adminEventUrl = (e: EventLike) => `${appUrl()}/admin/parties/${String(e._id)}`;

export type Rendered = { subject: string; html: string; text: string; attachments?: import("@/lib/email").EmailAttachment[] };

const textSignoff = (signoff = "The Official Party Committee 🥳") => ["", "Regards,", signoff].join("\n");

/* ------------------------------ party emails ------------------------------ */

export function thankYouEmail(e: EventLike, bills: { name: string; url: string }[]): Rendered {
  const billsHtml = bills.length
    ? `<p style="margin:18px 0 6px;font:600 16px ${HEADING_FONT}">🧾 Bills &amp; receipts</p><ul style="margin:0;padding-left:20px">${bills
        .map((b) => `<li style="margin:4px 0"><a href="${escapeHtml(b.url)}" style="color:${C.primary}">${escapeHtml(b.name)}</a></li>`)
        .join("")}</ul>`
    : "";
  const subject = "🎉 Thanks for the Treat!";
  const html = layout({
    eyebrow: "Party completed",
    title: subject,
    preheader: `A big thank you to ${e.organizerName} for ${e.title}!`,
    body:
      p("Hey Everyone!") +
      p(`A big thank you to ${strong(e.organizerName)} for the awesome ${strong(e.title)} party!`) +
      p("We appreciate the treat, the food, and most importantly, the generosity.") +
      p("Your contribution to keeping the Party Committee happy will never be forgotten. 😂") +
      details([
        ["🎉 Occasion", e.occasion || e.title],
        ["📅 Date", fmtDate(e.eventDate)],
        ["👤 Hosted by", e.organizerName],
      ]) +
      billsHtml +
      p("Thanks again!"),
    cta: { label: "View party details", url: eventUrl(e) },
  });
  const text = [
    "Hey Everyone!",
    "",
    `A big thank you to ${e.organizerName} for the awesome ${e.title} party!`,
    "We appreciate the treat, the food, and most importantly, the generosity.",
    "Your contribution to keeping the Party Committee happy will never be forgotten. 😂",
    "",
    `🎉 Occasion: ${e.occasion || e.title}`,
    `📅 Date: ${fmtDate(e.eventDate)}`,
    `👤 Hosted by: ${e.organizerName}`,
    ...(bills.length ? ["", "Bills:", ...bills.map((b) => `- ${b.name}: ${b.url}`)] : []),
    "",
    `View party details: ${eventUrl(e)}`,
    "",
    "Thanks again!",
    textSignoff(),
  ].join("\n");
  return { subject, html, text };
}

export function reminderEmail(e: EventLike, hoursBefore: number): Rendered {
  const when = hoursBefore >= 24 ? `${Math.round(hoursBefore / 24)} day(s)` : `${hoursBefore} hour(s)`;
  const subject = `⏰ Party Alert: ${e.title} in ${when}!`;
  const html = layout({
    eyebrow: "Party reminder",
    title: `${e.title} in ${when}!`,
    preheader: `${e.organizerName} is hosting. Clear your schedule.`,
    body:
      p(`Clear your schedule and loosen your belts! ${strong(e.organizerName)} is hosting ${strong(e.title)}.`) +
      details([
        ["📅 When", fmtDate(e.eventDate)],
        ["📍 Where", e.location],
        ["🎉 Occasion", e.occasion],
      ]) +
      p("Attendance is mandatory. Excuses are not accepted. 🍕"),
    cta: { label: "View party details", url: eventUrl(e) },
  });
  const text = `${subject}\n\n${e.organizerName} is hosting ${e.title}.\nWhen: ${fmtDate(e.eventDate)}\nWhere: ${e.location || "-"}\n\n${eventUrl(e)}${textSignoff()}`;
  return { subject, html, text };
}

export function instantAnnouncementEmail(e: EventLike): Rendered {
  const subject = `🚨 BREAKING NEWS: ${e.organizerName} is giving a party!`;
  const html = layout({
    eyebrow: "🔴 Breaking news",
    title: "Someone has finally decided to give a party!",
    preheader: `${e.organizerName}: ${e.title}`,
    body:
      p(`${strong(e.organizerName)} says: <em>${escapeHtml(e.title)}</em>`) +
      details([
        ["📍 Where", e.location],
        ["🎉 Occasion", e.occasion],
      ]) +
      (e.description ? p(escapeHtml(e.description)) : "") +
      p("Grab your plates! 🍽️"),
    cta: { label: "See the announcement", url: eventUrl(e) },
  });
  const text = `BREAKING NEWS! ${e.organizerName} is giving a party: ${e.title}\nWhere: ${e.location || "-"}\nGrab your plates!\n\n${eventUrl(e)}${textSignoff()}`;
  return { subject, html, text };
}

/** What changed since participants were last told (date and/or party giver). */
export type EventChanges = { previousDate?: Date | string | null; previousGiver?: string | null };

export function eventUpdateEmail(e: EventLike, changes: EventChanges = {}): Rendered {
  const dateChanged = !!changes.previousDate;
  const giverChanged = !!changes.previousGiver;
  const what = dateChanged && giverChanged ? "new date and party giver" : dateChanged ? "a new date" : giverChanged ? "a new party giver" : "new details";
  const subject = dateChanged ? `📅 Party moved: ${e.title} is now on ${fmtDay(e.eventDate)}` : `📝 Party update: ${e.title}`;
  const changeLines: string[] = [];
  if (dateChanged) changeLines.push(`📅 Date: ${fmtDate(changes.previousDate!)} → ${fmtDate(e.eventDate)}`);
  if (giverChanged) changeLines.push(`👤 Party giver: ${changes.previousGiver} → ${e.organizerName}`);
  const html = layout({
    eyebrow: "Party update",
    title: `${e.title} has ${what}`,
    body:
      p("Heads up! The Party Committee has updated an upcoming party.") +
      (changeLines.length ? callout(changeLines.map(escapeHtml).join("<br>")) : "") +
      details([
        ["🎉 Party", e.title],
        ["👤 Host", e.organizerName],
        ["📅 When", fmtDate(e.eventDate)],
        ["📍 Where", e.location],
      ]),
    cta: { label: "See latest details", url: eventUrl(e) },
  });
  const text = [subject, ...changeLines, `Host: ${e.organizerName}`, `When: ${fmtDate(e.eventDate)}`, `Where: ${e.location || "-"}`, "", eventUrl(e)].join("\n") + textSignoff();
  return { subject, html, text };
}

/** A minute after a party is added, to its participants. */
export function eventScheduledEmail(e: EventLike): Rendered {
  const subject = `🎉 New party: ${e.title} on ${fmtDay(e.eventDate)}`;
  const html = layout({
    eyebrow: "Party scheduled",
    title: `${e.organizerName} is giving a party! 🎉`,
    preheader: `${e.title} · ${fmtDate(e.eventDate)}`,
    body:
      p(`Mark your calendar! ${strong(e.organizerName)} is hosting ${strong(e.title)} and you're on the guest list.`) +
      details([
        ["📅 When", fmtDate(e.eventDate)],
        ["📍 Where", e.location],
        ["🎉 Occasion", e.occasion],
        ["👤 Hosted by", e.organizerName],
      ]) +
      (e.description ? p(escapeHtml(e.description)) : "") +
      p("Attendance is mandatory. Excuses are not accepted. 🍕"),
    cta: { label: "View party details", url: eventUrl(e) },
  });
  const text = [subject, "", `${e.organizerName} is hosting ${e.title}.`, `When: ${fmtDate(e.eventDate)}`, `Where: ${e.location || "-"}`, "", eventUrl(e)].join("\n") + textSignoff();
  return { subject, html, text };
}

export function eventCancelledEmail(e: EventLike): Rendered {
  const subject = `😢 Party cancelled: ${e.title}`;
  const html = layout({
    eyebrow: "Party cancelled",
    title: `${e.title} is cancelled 😢`,
    body:
      p(`Sad news. ${strong(e.title)} hosted by ${strong(e.organizerName)} has been cancelled.`) +
      p("Don't worry — the Party Committee never forgets. This debt is now officially on record. 📒"),
    cta: { label: "View details", url: eventUrl(e) },
  });
  return { subject, html, text: `${subject}\nThe Party Committee never forgets. 📒\n${eventUrl(e)}${textSignoff()}` };
}

/* ------------------------------ contri parties ----------------------------- */

/** The split shown in contri emails (see lib/contri.ts). */
export type ContriSplitLike = { total: number; headcount: number; perHead: number; payers: number; upiId: string; upiLink: string | null };

export const CONTRI_QR_CID = "contri-upi-qr";

const rupees = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);

/** Big "pay ₹X" card with the QR (attached inline as cid:CONTRI_QR_CID) or the fallback text. */
function contriPayCard(e: EventLike, s: ContriSplitLike, hasQr: boolean) {
  if (!s.upiId) {
    return callout(`Each person owes <strong>${escapeHtml(rupees(s.perHead))}</strong>. ${escapeHtml(e.organizerName)} hasn't added a UPI ID yet, so pay them the old-fashioned way (or ask for their UPI ID). 💸`);
  }
  const qr = hasQr
    ? `<img src="cid:${CONTRI_QR_CID}" width="200" height="200" alt="UPI QR code to pay ${escapeHtml(rupees(s.perHead))} to ${escapeHtml(e.organizerName)}" style="display:block;margin:0 auto 10px;border:0;border-radius:12px">`
    : "";
  const button = s.upiLink
    ? `<a href="${escapeHtml(s.upiLink)}" style="display:inline-block;margin-top:8px;padding:10px 20px;border-radius:999px;background:${C.violet};font:600 14px ${BODY_FONT};color:#ffffff;text-decoration:none">Pay ${escapeHtml(rupees(s.perHead))} in a UPI app</a>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:22px">
<tr><td align="center" style="padding:20px 18px;font:400 14px/1.6 ${BODY_FONT};color:#4c1d95">
<p style="margin:0 0 4px;font:600 13px ${BODY_FONT};letter-spacing:.06em;text-transform:uppercase">Your share</p>
<p style="margin:0 0 14px;font:700 34px/1.1 ${HEADING_FONT};color:${C.ink}">${escapeHtml(rupees(s.perHead))}</p>
${qr}
<p style="margin:0">Scan with any UPI app (GPay, PhonePe, Paytm, BHIM…) to pay <strong>${escapeHtml(e.organizerName)}</strong>.</p>
<p style="margin:4px 0 0;font-size:13px">UPI ID: <strong>${escapeHtml(s.upiId)}</strong></p>
${button}
</td></tr></table>`;
}

/**
 * Thank-you for a CONTRI party: everyone paid, so everyone thanks... themselves.
 * Carries the split and a UPI QR for each person's share.
 */
export function contriThankYouEmail(e: EventLike, s: ContriSplitLike, bills: { name: string; url: string }[], qrPng?: Buffer | null, settled = false): Rendered {
  // Everyone already paid (recorded in Payments): no QR, no "pay today".
  if (settled) {
    qrPng = null;
    s = { ...s, upiLink: null };
  }
  const subject = `🤝 Thank you... to yourself! ${e.title} is settled (almost)`;
  const billsHtml = bills.length
    ? `<p style="margin:18px 0 6px;font:600 16px ${HEADING_FONT}">🧾 Proof the money was spent on food</p><ul style="margin:0;padding-left:20px">${bills
        .map((b) => `<li style="margin:4px 0"><a href="${escapeHtml(b.url)}" style="color:${C.primary}">${escapeHtml(b.name)}</a></li>`)
        .join("")}</ul>`
    : "";
  const html = layout({
    eyebrow: "Contri party completed",
    title: "Thank you... to yourself! 🫵🎉",
    preheader: `Your share for ${e.title}: ${rupees(s.perHead)}. Pay ${e.organizerName} back.`,
    body:
      p("Hey Everyone!") +
      p(`${strong(e.title)} was a contri party, which means <strong>nobody</strong> was generous. Everyone was. Equally. To the paisa. 🧮`) +
      p("So this year's award for the Most Generous Party Giver goes to... <strong>you!</strong> 🏆 Please turn to the mirror and say <em>\"Thank you, I really shouldn't have.\"</em> Pat yourself on the back. Twice if you had seconds.") +
      p(`Special mention to ${strong(e.organizerName)}, who fronted the bill and is now <em>very</em> interested in your UPI app. 👀`) +
      details([
        ["🧾 Total bill", rupees(s.total)],
        ["👥 Split between", `${s.headcount} people`],
        ["💸 Your share", rupees(s.perHead)],
        ["📅 Date", fmtDate(e.eventDate)],
        ["💳 Pay to", s.upiId ? `${e.organizerName} (${s.upiId})` : e.organizerName],
      ]) +
      (settled ? callout(`✅ <strong>All settled.</strong> Everyone has already paid ${escapeHtml(e.organizerName)} back. Nothing to scan.`) : contriPayCard(e, s, !!qrPng)) +
      p(`${escapeHtml(e.organizerName)}: you're the host, so you don't pay yourself. Sit back and watch the notifications roll in. 📲`) +
      billsHtml +
      p(settled ? "Friendships intact. Contri paid. Legends, all of you. 😇" : "Remember: friendships end over unpaid contri. Pay today. 😇"),
    cta: { label: "View party & QR", url: eventUrl(e) },
  });
  const text = [
    "Hey Everyone!",
    "",
    `${e.title} was a contri party: nobody was generous, everyone was. Equally. So thank you... to yourself! 🏆`,
    `Special mention to ${e.organizerName}, who fronted the bill and is waiting for your payment. 👀`,
    "",
    `Total bill: ${rupees(s.total)}`,
    `Split between: ${s.headcount} people`,
    `Your share: ${rupees(s.perHead)}`,
    s.upiId ? `Pay to: ${e.organizerName} (UPI: ${s.upiId})` : `Pay to: ${e.organizerName}`,
    ...(settled ? ["All settled: everyone has already paid. Nothing to pay."] : s.upiLink ? [`UPI link: ${s.upiLink}`] : []),
    ...(bills.length ? ["", "Bills:", ...bills.map((b) => `- ${b.name}: ${b.url}`)] : []),
    "",
    `Party page (with the QR): ${eventUrl(e)}`,
    textSignoff(),
  ].join("\n");
  return {
    subject,
    html,
    text,
    attachments: qrPng ? [{ filename: "pay-your-share.png", content: qrPng, contentType: "image/png", cid: CONTRI_QR_CID }] : undefined,
  };
}

/** After approval of a contri party: the host gets thanks for fronting the bill, not for "the treat". */
export function contriHostThanksEmail(e: EventLike, subject: string, s: ContriSplitLike | null): Rendered {
  const html = layout({
    eyebrow: "Contri party approved ✅",
    title: `Thanks for fronting the bill, ${e.organizerName}! 🧾`,
    preheader: "Everyone has been sent their share and your UPI QR.",
    body:
      p(`Hi ${escapeHtml(e.organizerName)},`) +
      p(`The Party Committee confirms ${strong(e.title)} happened. Since it was a contri party, nobody owes you a thank-you for the treat... but everyone owes you <strong>money</strong>. 😄`) +
      (s
        ? details([
            ["🧾 Total bill", rupees(s.total)],
            ["👥 Split between", `${s.headcount} people (you included)`],
            ["💸 Each pays you", rupees(s.perHead)],
            ["💰 You should get back", rupees(Math.round(s.perHead * s.payers * 100) / 100)],
          ])
        : "") +
      (s?.upiId
        ? p(`Everyone gets a QR code for their share that pays <strong>${escapeHtml(s.upiId)}</strong>.`)
        : callout("Add your UPI ID on <strong>My profile</strong> (or on the party) so the team can scan a QR and pay you back.")),
    cta: { label: "See the party page", url: eventUrl(e) },
    signoff: "Your Team, via Party Police 🥳",
  });
  const text = [
    `Hi ${e.organizerName},`,
    "",
    `${e.title} is approved. It was a contri party, so everyone owes you their share${s ? ` of ${rupees(s.perHead)}` : ""}.`,
    s?.upiId ? `They've been sent a QR that pays ${s.upiId}.` : "Add your UPI ID on My profile so everyone can pay you by QR.",
    "",
    eventUrl(e),
    textSignoff("Your Team, via Party Police 🥳"),
  ].join("\n");
  return { subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`, html, text };
}

/* --------------------------- party-day emails ---------------------------- */

/** Same subject for every message in a party's confirmation thread (giver, Super Admin, thanks). */
export function confirmationThreadSubject(e: Pick<EventLike, "title" | "eventDate">) {
  return `🎉 Party confirmation: ${e.title} — ${fmtDay(e.eventDate)}`;
}

/** 9 AM on the party day, to every active member. */
export function partyDayEmail(e: EventLike): Rendered {
  const subject = `🎉 Party today: ${e.title}!`;
  const html = layout({
    eyebrow: "Party day",
    title: "Today we will have a party! 🎉",
    preheader: `${e.organizerName} is hosting ${e.title} today.`,
    body:
      p("Good morning, Party People!") +
      p(`Today is the day. ${strong(e.organizerName)} is giving us ${strong(e.title)}. Skip the heavy breakfast. 🍕`) +
      details([
        ["🕒 When", fmtDate(e.eventDate)],
        ["📍 Where", e.location],
        ["🎉 Occasion", e.occasion],
        ["👤 Hosted by", e.organizerName],
      ]) +
      (e.description ? p(escapeHtml(e.description)) : "") +
      p("Attendance is mandatory. Excuses are not accepted."),
    cta: { label: "View party details", url: eventUrl(e) },
  });
  const text = [
    "Good morning, Party People!",
    "",
    `Today we will have a party! ${e.organizerName} is giving us ${e.title}.`,
    `When: ${fmtDate(e.eventDate)}`,
    `Where: ${e.location || "-"}`,
    "",
    eventUrl(e),
    textSignoff(),
  ].join("\n");
  return { subject, html, text };
}

/** 9 AM on the party day, to the party giver. Starts the confirmation thread. */
export function giverNoticeEmail(e: EventLike, subject: string): Rendered {
  const html = layout({
    eyebrow: "You are the host today",
    title: `Today you're giving the party, ${e.organizerName}! 🥳`,
    preheader: `${e.title} is today. The Committee is watching.`,
    body:
      p(`Hi ${escapeHtml(e.organizerName)},`) +
      p(`This is your official reminder that today you are giving ${strong(e.title)}. The whole team has been told, so there is no escape now. 😄`) +
      details([
        ["🕒 When", fmtDate(e.eventDate)],
        ["📍 Where", e.location],
        ["🎉 Occasion", e.occasion],
      ]) +
      callout("Once the party is given, the Super Admin will confirm it. You'll get a thank-you from the team in this same email thread."),
    cta: { label: "View your party", url: eventUrl(e) },
  });
  const text = [
    `Hi ${e.organizerName},`,
    "",
    `Today you are giving the party: ${e.title}.`,
    `When: ${fmtDate(e.eventDate)}`,
    `Where: ${e.location || "-"}`,
    "",
    "Once the party is given, the Super Admin will confirm it, and you'll get a thank-you from the team in this same thread.",
    "",
    eventUrl(e),
    textSignoff(),
  ].join("\n");
  return { subject, html, text };
}

/** 9 AM on the party day, to the Super Admin: confirm the party was given. Same thread subject. */
export function approvalRequestEmail(e: EventLike, subject: string, giverEmail?: string | null): Rendered {
  const html = layout({
    eyebrow: "Approval needed",
    title: `Please confirm ${e.organizerName} has given the party`,
    preheader: `${e.title} is today. Approve it once it's done.`,
    body:
      p("Hi Super Admin,") +
      p(`${strong(e.organizerName)} is giving ${strong(e.title)} today.`) +
      details([
        ["👤 Party giver", giverEmail ? `${e.organizerName} (${giverEmail})` : e.organizerName],
        ["🕒 When", fmtDate(e.eventDate)],
        ["📍 Where", e.location],
        ["🎉 Occasion", e.occasion],
      ]) +
      callout("The party is marked <strong>completed only after you approve it</strong>. Approving sends a thank-you from the team to the party giver in this thread."),
    cta: { label: "Review & approve the party", url: adminEventUrl(e) },
    signoff: "Party Police HQ 🚨",
  });
  const text = [
    "Hi Super Admin,",
    "",
    `${e.organizerName} is giving ${e.title} today (${fmtDate(e.eventDate)}).`,
    "The party is marked completed only after you approve it.",
    "",
    `Approve: ${adminEventUrl(e)}`,
    textSignoff("Party Police HQ 🚨"),
  ].join("\n");
  return { subject, html, text };
}

/** After approval: thanks to the party giver from the team, as a reply in the confirmation thread. */
export function giverThanksEmail(e: EventLike, subject: string, approvedAt: Date | string): Rendered {
  const html = layout({
    eyebrow: "Party approved ✅",
    title: `Thank you, ${e.organizerName}! 🙏`,
    preheader: "The Party Committee confirms your party. Debt cleared!",
    body:
      p(`Hi ${escapeHtml(e.organizerName)},`) +
      p(`The Party Committee has officially confirmed that you gave ${strong(e.title)}. On behalf of the whole team: <strong>thank you for the treat!</strong> 🎉`) +
      p("Your name has been cleared from any pending party debts, and your legend status grows. 🏆") +
      details([
        ["🎉 Party", e.title],
        ["📅 Date", fmtDate(e.eventDate)],
        ["✅ Approved", fmtDateTime(approvedAt)],
      ]) +
      p("Until the next promotion... 😉"),
    cta: { label: "See the party page", url: eventUrl(e) },
    signoff: "Your Team, via Party Police 🥳",
  });
  const text = [
    `Hi ${e.organizerName},`,
    "",
    `The Party Committee has officially confirmed that you gave ${e.title}.`,
    "On behalf of the whole team: thank you for the treat! 🎉",
    "",
    eventUrl(e),
    textSignoff("Your Team, via Party Police 🥳"),
  ].join("\n");
  return { subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`, html, text };
}

/* ------------------------------ user emails ------------------------------ */

type UserLike = { name: string; email: string; role: UserRole; department?: string | null; designation?: string | null };

const ROLE_NAME: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin (Party Officer)",
  manager: "Manager (Party Planner)",
  member: "Member",
};

/** What each role can do, in one line (role upgrade + credentials emails). */
const ROLE_POWERS: Record<UserRole, string> = {
  super_admin: "You run the whole show.",
  admin: "You can manage users, approve parties and run Party HQ.",
  manager: "You can schedule and modify everyone's parties.",
  member: "You can add the parties you are giving and ask for approval once they're done.",
};

const signInUrl = () => `${appUrl()}/admin/login`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Bullet list styled like the website's cards. */
const bullets = (items: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 18px">${items
    .map(
      ([emoji, html]) =>
        `<tr><td style="width:34px;padding:7px 0;vertical-align:top;font-size:18px;line-height:1.4">${emoji}</td><td style="padding:7px 0;font:400 15px/1.55 ${BODY_FONT};color:${C.ink}">${html}</td></tr>`
    )
    .join("")}</table>`;

/** Sent when a user is added. Never contains a password. */
export function welcomeEmail(u: UserLike): Rendered {
  const first = u.name.trim().split(/\s+/)[0] || u.name;
  const isAdmin = u.role === "admin" || u.role === "super_admin";
  const subject = `🚨 Welcome to the Party Police, ${first}! (There is no leaving)`;
  const loginUrl = signInUrl();
  const html = layout({
    eyebrow: "New recruit 🎉",
    title: `Welcome to the Party Police, ${first}!`,
    preheader: "You're officially on the list. Attendance is mandatory. Calories don't count.",
    body:
      p(`Hi ${escapeHtml(first)},`) +
      p("Congratulations! You've been officially recruited into the <strong>Party Police</strong>, the only department where attendance is mandatory, calories don't count, and nobody escapes. 🚨") +
      `<p style="margin:18px 0 0;font:600 16px ${HEADING_FONT};color:${C.ink}">Your new life, in four rules:</p>` +
      bullets([
        ["🎂", "Birthday? Promotion? New job? Salary hike? <strong>Congratulations, you owe everyone a party.</strong> We don't make the rules. (We do make the rules.)"],
        ["⏰", "On party days we email you at <strong>9 AM</strong>, so you can skip breakfast strategically."],
        ["🏆", "Pay your party debts and you become a <strong>Party Legend</strong>. Don't, and you headline the <strong>Hall of Shame</strong>. Forever. With a countdown."],
        ["🍕", "Free food may contain traces of team bonding. Side effects include happiness and loosened belts."],
      ]) +
      details([
        ["👤 Name", u.name],
        ["✉️ Email", u.email],
        ["🎖️ Rank", ROLE_NAME[u.role]],
        ["🏢 Team", [u.designation, u.department].filter(Boolean).join(" · ") || null],
      ]) +
      (isAdmin
        ? callout(
            `You're also a <strong>Party Officer</strong> 🫡. You can sign in to Party HQ and approve parties. Use this email address and the password the Super Admin shared with you. With great power comes great snack responsibility.`
          )
        : u.role === "manager"
          ? callout("You're also a <strong>Manager</strong> 🗓️. You can sign in to Party HQ and schedule or modify everyone's parties.")
          : "") +
      p("Welcome aboard. Bring an appetite. Excuses are not accepted. 🍽️"),
    cta: isAdmin ? { label: "Sign in to Party HQ", url: loginUrl } : { label: "See upcoming parties", url: `${appUrl()}/parties` },
  });
  const text = [
    `Hi ${first},`,
    "",
    "Congratulations! You've been officially recruited into the Party Police: attendance is mandatory, calories don't count, and nobody escapes. 🚨",
    "",
    "Your new life, in four rules:",
    "🎂 Birthday? Promotion? New job? Salary hike? You owe everyone a party.",
    "⏰ On party days we email you at 9 AM, so you can skip breakfast strategically.",
    "🏆 Pay your party debts and become a Party Legend. Don't, and you headline the Hall of Shame.",
    "🍕 Free food may contain traces of team bonding.",
    "",
    `Rank: ${ROLE_NAME[u.role]}`,
    ...(isAdmin ? ["", `You're also a Party Officer: sign in at ${loginUrl} with this email and the password the Super Admin shared with you.`] : ["", `Upcoming parties: ${appUrl()}/parties`]),
    "",
    "Welcome aboard. Bring an appetite. Excuses are not accepted. 🍽️",
    textSignoff(),
  ].join("\n");
  return { subject, html, text };
}

/**
 * Username + one-time password. Sent separately from the welcome email.
 * The password is generated by the worker right before sending and is never stored in plain text.
 */
export function credentialsEmail(u: UserLike, password: string): Rendered {
  const first = firstName(u.name);
  const subject = "🔑 Your Party Police login details";
  const html = layout({
    eyebrow: "Login details",
    title: `Here's how you sign in, ${first}`,
    preheader: "Your username and a one-time password for Party HQ.",
    body:
      p(`Hi ${escapeHtml(first)},`) +
      p("You can now sign in to <strong>Party HQ</strong>. Here are your login details:") +
      details([
        ["👤 Username", u.email],
        ["🔑 One-time password", password],
        ["🎖️ Role", ROLE_NAME[u.role]],
      ]) +
      callout("This password works for <strong>one sign-in only</strong>. Right after you sign in you'll be asked to choose your own password before you can use anything else.") +
      p(escapeHtml(ROLE_POWERS[u.role])) +
      p("Didn't expect this email? You can safely ignore it."),
    cta: { label: "Sign in to Party HQ", url: signInUrl() },
    signoff: "Party Police HQ 🚨",
  });
  const text = [
    `Hi ${first},`,
    "",
    "You can now sign in to Party HQ.",
    `Username: ${u.email}`,
    `One-time password: ${password}`,
    "",
    "This password works for one sign-in only. You'll be asked to choose your own password right after signing in.",
    "",
    `Sign in: ${signInUrl()}`,
    textSignoff("Party Police HQ 🚨"),
  ].join("\n");
  return { subject, html, text };
}

/** Sent only when a user's role goes UP (never on a demotion). */
export function roleUpgradeEmail(u: UserLike, from: UserRole): Rendered {
  const first = firstName(u.name);
  const subject = `🎖️ You've been promoted to ${ROLE_NAME[u.role]}!`;
  const html = layout({
    eyebrow: "Promotion 🎖️",
    title: `Congratulations, ${first}! You're now ${ROLE_NAME[u.role]}`,
    preheader: ROLE_POWERS[u.role],
    body:
      p(`Hi ${escapeHtml(first)},`) +
      p(`Your Party Police rank was upgraded from ${strong(ROLE_NAME[from])} to ${strong(ROLE_NAME[u.role])}. 🎉`) +
      callout(escapeHtml(ROLE_POWERS[u.role])) +
      p("And yes: a promotion means you owe everyone a party. We don't make the rules. 😉"),
    cta: { label: "Open Party HQ", url: signInUrl() },
  });
  const text = [`Hi ${first},`, "", `You're now ${ROLE_NAME[u.role]} (was ${ROLE_NAME[from]}).`, ROLE_POWERS[u.role], "", signInUrl(), textSignoff()].join("\n");
  return { subject, html, text };
}

/* ---------------------------- commitment emails --------------------------- */

type CommitmentLike = { personName: string; reason: string; dueDate: Date | string };

export function defaulterReminderEmail(c: CommitmentLike, overdueDays: number, tease: string): Rendered {
  const subject = overdueDays > 0 ? `🍕 Friendly reminder: your party is ${overdueDays} day(s) overdue` : "🍕 Friendly reminder: you owe us a party!";
  const html = layout({
    eyebrow: "Friendly reminder",
    title: overdueDays > 0 ? `Your party is ${overdueDays} day(s) overdue` : "You owe us a party!",
    body:
      p(`Hi ${escapeHtml(c.personName)},`) +
      p(`The Party Committee would like to remind you about your pending party for: ${strong(c.reason)}.`) +
      details([["📅 Due date", fmtDay(c.dueDate)]]) +
      p(`<em>${escapeHtml(tease)}</em>`),
    cta: { label: "Visit the Hall of Shame", url: `${appUrl()}/hall-of-shame` },
  });
  return { subject, html, text: `Hi ${c.personName},\nYou owe us a party for: ${c.reason}\n${tease}\n${appUrl()}/hall-of-shame${textSignoff()}` };
}

export function overdueNoticeEmail(c: CommitmentLike, overdueDays: number): Rendered {
  const subject = `🚨 PUBLIC NOTICE: ${c.personName} owes us a party!`;
  const html = layout({
    eyebrow: "🚨 Public notice",
    title: `${c.personName} owes us a party!`,
    body:
      p(`${strong(c.personName)} owes everyone a party for ${strong(c.reason)}.`) +
      p(`It is now <strong>${overdueDays} day(s)</strong> overdue. Please remind them gently (or loudly). 📢`),
    cta: { label: "See the Hall of Shame", url: `${appUrl()}/hall-of-shame` },
  });
  return { subject, html, text: `${subject}\n${c.personName} owes a party for ${c.reason}. ${overdueDays} day(s) overdue.${textSignoff()}` };
}

export function testEmail(): Rendered {
  return {
    subject: "🧪 Party Police test email",
    html: layout({
      eyebrow: "SMTP test",
      title: "SMTP works! 🎉",
      body: p("If you can read this, the Party Committee can now reach everyone. Nobody escapes."),
    }),
    text: "SMTP works! Nobody escapes the Party Committee.",
  };
}
