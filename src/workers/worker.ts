/**
 * Dedicated notification worker process.
 *   npm run worker
 * Runs alongside `next start` on the same server. Set RUN_WORKER_IN_APP=false
 * on the web process if you run this separately.
 */
import "@/config/load-dotenv";
import { connectDB, disconnectDB } from "@/lib/mongodb";
import { startWorkerLoop } from "./runtime";

async function main() {
  await connectDB();
  const worker = startWorkerLoop({ label: "standalone" });
  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} received, shutting down`);
    worker.stop();
    await disconnectDB();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
