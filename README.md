# Party Police 🚨

> Life is short. Salaries are temporary. Parties are mandatory!

A small, playful party management app for friends and teams. It tracks scheduled and instant parties, budgets, party debts (the **Hall of Shame**), the hosts who paid up (**Party Legends**), deals, and bills. It also sends funny emails automatically, including a thank-you 5 minutes after a party is marked completed.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · MongoDB + Mongoose · Zod · Nodemailer · date-fns · Lucide.
There is one deployable app and one database. There is no Redis, no S3, no separate backend, and no external queue.

---

## Quick start (development)

```bash
npm install
cp .env.example .env         # then fill in the values (see below)
npm run db:dev               # (optional) local MongoDB on :27017 if you don't have one installed
npm run seed                 # admin + default budgets + sample parties
npm run dev                  # http://localhost:3000
```

- Admin panel: <http://localhost:3000/admin/login>. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.
- With `SMTP_HOST=console`, emails are printed to the server log instead of being sent.
- The email worker runs inside the Next.js server by default (`RUN_WORKER_IN_APP=true`).

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run worker` | Dedicated notification worker process (see *Deployment*) |
| `npm run seed` | Admin + default budget limits + sample data (refuses to run in production) |
| `npm run seed -- --fresh` | Wipe party data and reseed (development only) |
| `npm run seed:admin [-- --reset]` | Create the Super Admin from env, or reset its password (also logs out all sessions) |
| `npm run migrate:users [-- --drop]` | One-time move from the old `admins`/`members` collections into `users` |
| `npm run db:dev` | Local persistent MongoDB in `./.mongo-data` (development only) |
| `npm test` | Vitest suite against an in-memory MongoDB replica set |
| `npm run typecheck` / `lint` | TypeScript / ESLint |

## Environment variables

See [.env.example](.env.example). Everything is server-side, and nothing uses `NEXT_PUBLIC_`.

| Variable | Notes |
|---|---|
| `APP_URL` | Public base URL. Used for email links and signed URLs, and as the allowed CSRF origin. |
| `MONGODB_URI` | The only database. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Super Admin credentials (password ≥ 10 chars). |
| `AUTH_SECRET`, `FILE_SIGNING_SECRET` | ≥ 32 chars each. `FILE_SIGNING_SECRET` signs private file links; rotating it invalidates all outstanding links. |
| `SMTP_*` | Standard SMTP. Use `SMTP_HOST=console` in development. |
| `CRON_SECRET` | Bearer token for the optional `POST /api/cron/tick` trigger. |
| `STORAGE_PATH`, `MAX_FILE_SIZE` | Private upload directory (must be persistent) and the size limit in bytes. |
| `RUN_WORKER_IN_APP`, `WORKER_POLL_INTERVAL_MS`, `THANK_YOU_DELAY_MS` | Worker placement, polling interval, and the thank-you delay (default 5 min). |
| `APP_TIMEZONE` | The team's timezone (IANA name, default `Asia/Kolkata`). Decides what "party day" and "9 AM" mean, and how dates appear in emails. |

---

## Architecture

```text
src/
├── app/
│   ├── (public)/            # Home, parties, calendar, hall-of-shame, discounts (no login)
│   ├── admin/login/         # Login page
│   ├── admin/(panel)/       # Protected admin panel (session validated server-side)
│   └── api/                 # Route handlers: auth, events, commitments, calendar, dashboard,
│                            #   discounts, budgets, bills, files, notifications, settings, cron, audit
├── components/              # ui/ (shadcn), shared/, events/, calendar/, bills/, admin/
├── config/env.ts            # Zod-validated server env
├── lib/                     # mongodb, auth, crypto, storage, signed-url, scheduler, email(+templates),
│                            #   validation (Zod), api/ (handler + errors), humor, format
├── models/                  # Mongoose models
├── services/                # Business logic (no UI, no framework coupling; unit-tested)
├── workers/                 # Worker loop (in-app via instrumentation.ts, or standalone)
├── instrumentation.ts       # Starts the in-app worker on server boot
└── proxy.ts                 # Optimistic /admin redirect (real auth checks happen per request)
storage/                     # Uploaded files (git-ignored, never served statically)
```

- **Services** hold all business rules and database access. Route handlers only parse input with Zod, authorize, and call a service. Pages are Server Components that call services directly. Only interactive pieces are Client Components.
- **Cache Components:** data is always fresh. Data components call `await connection()` inside `<Suspense>`, so the static shell prerenders and data streams in. Admin mutations call `router.refresh()`.
- **API responses** have one consistent shape: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`. List endpoints support `page`, `limit`, filters and `sort`.

### Users & roles

All people live in **one `users` collection**. Email is each user's unique key and is never changed through the app. Every **active** user is a party member: they get party emails and can be chosen as a party giver. That includes admins and the Super Admin.

| Role | Signs in | Can do | Protection |
|---|---|---|---|
| **Super Admin** (exactly one, from `ADMIN_EMAIL`/`ADMIN_PASSWORD`) | ✅ | Everything, including managing admins | Can't be deleted, deactivated or demoted. Only they can edit their own account. |
| **Admin** | ✅ | Everything except managing admins | Can't be deleted. The Super Admin must change them to member first. |
| **Member** | ❌ (no password) | — | Can be deactivated or deleted by any admin |

- *Admin → Users* has search, role and status filters, and a per-row menu: edit, make admin, change to member, set password, deactivate and delete.
- *My profile* (from the sidebar) lets a signed-in user edit their details and change their password. Changing the password signs out their other sessions.
- Losing admin access (demoted or deactivated) or getting a new password signs the person out everywhere immediately. Sessions are re-checked against `users` on every request.
- To move the Super Admin to another email, update `ADMIN_EMAIL` and run `npm run seed:admin`. It's the same account, moved to the new email, and its password is taken from `ADMIN_PASSWORD`.
- **Upgrading from the old `admins` + `members` collections:** run `npm run migrate:users -- --drop`. It's idempotent, keeps ids and passwords, and re-points party approvals. Everyone signs in again afterwards.

### Authentication & access control

- There is one Super Admin, any number of admins, and no public registration. Passwords are hashed with bcrypt (12 rounds).
- A login creates a random 256-bit session token. Only its SHA-256 is stored in MongoDB, with a TTL index. The cookie `pp_session` is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Every** admin page and API call validates the session against the database. Role checks never happen in the browser.
- **CSRF:** every mutating request must carry an `Origin` (or `Referer`) header that matches the app's origin.
- **Rate limiting:** login allows 5 attempts per 15 minutes, counted per IP and per email. The counters live in MongoDB.
- Public visitors get read-only endpoints. Private parties, participant emails and private notes are filtered out server-side.

### Budgets

- Each category has a min/max stored in `BudgetSettings`; there is no hardcoded fallback. A `null` limit is accepted only with an explicit `noMinimum`/`noMaximum` flag.
- Validation runs on the backend. Out-of-range budgets get `422 BUDGET_OUT_OF_RANGE` unless the request includes `budgetOverride: { reason }`, and every override is written to the audit log.
- The budget belongs to the event. Changing the settings never rewrites existing parties, and editing an old party only re-validates its budget if the budget or category changes.
- Validation can be turned off globally or per category.

### Files (bills & attachments)

- Files are stored at `storage/{bills|attachments}/{eventId}/{fileId}.{ext}`. MongoDB holds only metadata, and the storage key is never sent to clients.
- Uploads are checked by **magic bytes** (PDF/JPEG/PNG/WEBP), and the extension must match the contents. Size is limited, filenames are sanitized for display only, IDs are generated server-side, and writes are atomic (temp file + rename).
- All downloads go through `GET /api/files/:fileId`. The client only ever sends an ObjectId, never a path. Keys are regex-validated and must resolve inside the storage root.
  - A **public** file (and its event) is served to anyone.
  - Otherwise the request needs an **admin session** or a **signed URL**. The signature is HMAC-SHA256 over `fileId|op|exp`, checked with a timing-safe comparison, is short-lived (max 7 days), and is bound to one file and one operation.
  - Responses set `Content-Type`, `Content-Disposition`, `nosniff`, and `no-store` for private files.
- Deleting a bill or a party also deletes the physical files.

### Notifications & the MongoDB job scheduler

- `ScheduledJob` is the persistent queue. It has a **unique `idempotencyKey`**, so the same logical email can never be queued twice.
- The worker claims jobs with an atomic `findOneAndUpdate` (`pending → processing`), so concurrent workers never process the same job. Jobs stuck in `processing` for 5 minutes or more are recovered. Failures retry with backoff (1m, 5m, 15m, then 60m) up to the retry limit.
- Each job re-checks its preconditions right before sending: the event still exists, the status is right, the completion version matches, and notifications are enabled.
- **Delivery-state guard:** one `NotificationLog` exists per idempotency key. A log marked `sent` is never sent again. A log still marked `sending` after a crash becomes `uncertain` and is **not** resent automatically; an admin can retry it explicitly from *Email Notifications*. Exactly-once delivery isn't possible over SMTP; this design keeps duplicates to that rare, visible case.
- **Thank-you flow:** marking a party completed increments `completionVersion` and queues `thank_you:{eventId}:v{n}` for `completedAt + 5 min`. Reverting cancels the pending job, and a stale version is skipped even if a worker already claimed it. Bills uploaded during the 5-minute window are included: public ones as links, private ones as expiring signed links only if enabled in settings.
- **Party day (default 9 AM in `APP_TIMEZONE`, configurable in Settings):**
  - All active members get "Today we will have a party!". Instant parties skip this, because they were already announced.
  - The party giver (the organizer email) gets their own email.
  - The Super Admin gets an approval request.
  - The giver's and Super Admin's emails share one subject that includes the date, e.g. `🎉 Party confirmation: Pizza Party — 17 Nov 2026`. They are linked with `Message-ID`/`In-Reply-To`, so mail clients keep them in one thread.
- **Approval:** a party becomes *completed* only when an admin clicks **Approve party**. The approver and the time are recorded. The dashboard lists parties that have started but aren't approved yet.
  - Approving sends the team's thank-you to the party giver right away, as `Re: <same subject>` in the same thread, with the Super Admin in CC.
  - The everyone-thank-you still goes out 5 minutes later.
  - Undoing an approval cancels any thank-yous that haven't been sent yet.
- Email design matches the website: pink, violet and amber theme, Fredoka headings, rounded cards. Templates are table-based with inline styles so they render in Gmail, Outlook and Apple Mail.
- Other notification types: instant announcements, upcoming reminders (configurable hours before, one per interval), event updates (debounced to one per 2 minutes), cancellations, defaulter reminders (every N days, sent to the person), and public overdue notices. Each type can be toggled in *Email Notifications*.

---

## Deployment

The app needs a **persistent Node.js server with a writable local disk**, such as a VM, a bare-metal host, or a container with a mounted volume. It does **not** support ephemeral serverless filesystems.

```bash
npm ci
npm run build
npm run seed:admin                 # first deploy only
NODE_ENV=production npm start      # web server (+ in-app worker by default)
```

**Storage persistence:** point `STORAGE_PATH` at a directory outside the release folder that survives deploys, for example `/var/lib/party-police/storage`, or a mounted Docker volume. Deploy scripts must never delete it. Back it up along with MongoDB.

**Worker options.** Pick one or combine them; atomic claiming keeps them safe together.

1. **In-app (default):** `RUN_WORKER_IN_APP=true`. The worker starts with `next start` via `instrumentation.ts`.
2. **Dedicated process:** set `RUN_WORKER_IN_APP=false` on the web process and run `npm run worker` under a process manager. Example with pm2:
   ```bash
   pm2 start "npm start" --name party-web
   pm2 start "npm run worker" --name party-worker
   ```
3. **External trigger:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/tick` from system cron, once a minute.

Put a reverse proxy with TLS (nginx, Caddy) in front, and set `APP_URL` to the public HTTPS origin.

## Testing

`npm test` runs 59 tests against a real (in-memory) MongoDB replica set. They cover:

- admin login, session expiry, logout and rate limiting
- multiple monthly parties, and private events hidden from the public
- budget range enforcement, unlimited limits, audited overrides, the global toggle, and historical events left unchanged
- hiding expired, future and inactive discounts, and category/venue applicability
- magic-byte validation, filename sanitizing, **path traversal** rejection, and signed URLs (expiry, tampering, wrong file or operation)
- files on disk vs. metadata in MongoDB, private by default, surviving reconnects, and cleanup on delete
- the thank-you job at exactly +5 min, revert → cancel, stale versions skipped, deleted or disabled → not sent
- users: one collection, unique email that can't change, exactly one Super Admin, members can't sign in, Super Admin and admins can't be deleted, only the Super Admin manages admins, demote or deactivate signs the person out, password change keeps only the current session, moving the Super Admin's email, and the legacy migration
- party day: 9 AM scheduling in the team timezone, active members only, giver and Super Admin emails threaded under one subject, approval sends a threaded thanks with the Super Admin in CC, moved or approved parties skip stale emails
- duplicate-enqueue prevention, single-worker claiming, restart recovery, sent → never resent, uncertain → no automatic resend, and retry/backoff → failed

The HTTP layer (401 for public users on admin APIs, CSRF rejection, signed and expired links, traversal URLs, public assets, the delayed email, and a job surviving a server restart) was smoke-tested against `next start` with curl.
