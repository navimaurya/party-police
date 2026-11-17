/**
 * Runs once when the Next.js server starts.
 * 1. In development, makes `.env` the source of truth (see below).
 * 2. Optionally starts the MongoDB-backed notification worker inside the web
 *    process (RUN_WORKER_IN_APP=true, default).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Next.js normally lets variables already exported in the terminal win over `.env`.
  // A stale `export MONGODB_URI=...` then silently points the app at another database,
  // while the scripts (seed, worker) use `.env`. In development `.env` always wins, so
  // the app and the scripts use the same database and SMTP settings.
  // In production, the platform's environment variables keep priority.
  if (process.env.NODE_ENV !== "production") {
    const { config } = await import("dotenv");
    const before = process.env.MONGODB_URI;
    config({ override: true, quiet: true });
    if (before && before !== process.env.MONGODB_URI) {
      console.warn("[env] MONGODB_URI from your terminal was ignored; using the one in .env");
    }
  }

  if (process.env.RUN_WORKER_IN_APP === "false") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.MONGODB_URI) {
    console.warn("[worker] MONGODB_URI not set; in-app worker not started");
    return;
  }
  const { startWorkerLoop } = await import("./workers/runtime");
  startWorkerLoop({ label: "in-app" });
}
