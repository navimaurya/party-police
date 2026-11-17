import { env } from "@/config/env";
import { cleanupTemp } from "@/lib/storage";
import { runWorkerTick, WORKER_ID } from "@/services/notification.service";

const g = globalThis as unknown as { __ppWorker?: { stop: () => void } };

/**
 * Starts the polling loop. Safe to run in several processes at once: jobs are
 * claimed atomically in MongoDB, so each job is processed by exactly one worker.
 */
export function startWorkerLoop(opts: { label: string; intervalMs?: number }) {
  if (g.__ppWorker) return g.__ppWorker;
  const intervalMs = opts.intervalMs ?? env().WORKER_POLL_INTERVAL_MS;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let lastCleanup = 0;

  const loop = async () => {
    if (stopped) return;
    try {
      const r = await runWorkerTick();
      const sent = r.processed.filter((p) => p.outcome !== "skipped").length;
      if (r.recovered || r.processed.length) {
        console.info(`[worker:${opts.label}] recovered=${r.recovered} processed=${r.processed.length} (non-skipped=${sent})`);
      }
      if (Date.now() - lastCleanup > 60 * 60 * 1000) {
        lastCleanup = Date.now();
        await cleanupTemp();
      }
    } catch (err) {
      console.error(`[worker:${opts.label}] tick failed`, err);
    } finally {
      // Persistent jobs live in MongoDB; this timer only paces polling.
      if (!stopped) timer = setTimeout(loop, intervalMs);
    }
  };

  console.info(`[worker:${opts.label}] started id=${WORKER_ID} every ${intervalMs}ms`);
  timer = setTimeout(loop, 1000);
  g.__ppWorker = {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      g.__ppWorker = undefined;
    },
  };
  return g.__ppWorker;
}
