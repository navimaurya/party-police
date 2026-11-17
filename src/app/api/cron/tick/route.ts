import { env } from "@/config/env";
import { ok, route } from "@/lib/api/handler";
import { safeEqual } from "@/lib/crypto";
import { unauthorized } from "@/lib/errors";
import { runWorkerTick } from "@/services/notification.service";

/**
 * Optional external trigger (system cron / uptime pinger) for one worker tick.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/tick
 * Safe to call alongside the background worker: jobs are claimed atomically.
 */
export const POST = route(async (req) => {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) throw unauthorized("Invalid cron secret");
  const result = await runWorkerTick({ workerId: "cron", forceScan: true });
  return ok(result);
});
