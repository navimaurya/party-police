import { describe, expect, it, vi } from "vitest";
import { NotificationLog, ScheduledJob, AppSettings } from "@/models";
import { claimNextJob, enqueueJob, recoverAbandonedJobs } from "@/lib/scheduler";
import { createEvent, deleteEvent, setEventStatus, thankYouKey, updateEvent } from "@/services/event.service";
import { processJob, retryJob, runWorkerTick, enqueueRecurringNotifications } from "@/services/notification.service";
import { CreateEventSchema } from "@/lib/validation";
import * as email from "@/lib/email";
import { baseEvent, makeAdmin, setRecipients } from "./helpers";

const FIVE_MIN = 5 * 60 * 1000;

async function completedEvent() {
  const actor = await makeAdmin();
  await setRecipients(["team@party.test"]);
  const e = await createEvent(CreateEventSchema.parse(baseEvent()), actor);
  const after = await setEventStatus(String(e._id), "completed", actor);
  return { actor, id: String(e._id), event: after };
}

function spySend() {
  return vi.spyOn(email, "sendEmail").mockResolvedValue({ messageId: "<m@test>", accepted: ["x@test"], rejected: [], response: "250 OK" });
}

describe("thank-you email after completion", () => {
  it("schedules exactly one job 5 minutes after completion", async () => {
    const { id, event } = await completedEvent();
    const jobs = await ScheduledJob.find({ jobType: "thank_you" }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].idempotencyKey).toBe(thankYouKey(id, 1));
    expect(jobs[0].completionVersion).toBe(1);
    const delay = new Date(jobs[0].scheduledAt).getTime() - new Date(event.completedAt!).getTime();
    expect(delay).toBe(FIVE_MIN);
  });

  it("does not send before the 5 minutes elapse, sends once after", async () => {
    const send = spySend();
    await completedEvent();
    expect(await claimNextJob("w1")).toBeNull(); // not yet due
    const job = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000));
    expect(job).not.toBeNull();
    const r = await processJob(job!, "w1");
    expect(r.outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toBe("🎉 Thanks for the Treat!");
    const log = await NotificationLog.findOne({ notificationType: "thank_you" }).lean();
    expect(log?.status).toBe("sent");
    send.mockRestore();
  });

  it("cancels the pending email when completion is reverted", async () => {
    const { actor, id } = await completedEvent();
    await setEventStatus(id, "upcoming", actor);
    expect((await ScheduledJob.findOne({ jobType: "thank_you" }).lean())?.status).toBe("cancelled");
  });

  it("re-completion creates a new version; the stale one is skipped even if it was claimed", async () => {
    const send = spySend();
    const { actor, id } = await completedEvent();
    const stale = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000)); // claimed (processing) before revert
    await setEventStatus(id, "upcoming", actor);
    await setEventStatus(id, "completed", actor);
    expect(await ScheduledJob.countDocuments({ jobType: "thank_you" })).toBe(2);
    expect((await processJob(stale!, "w1")).outcome).toBe("skipped"); // stale completion version
    const fresh = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000));
    expect(fresh?.completionVersion).toBe(2);
    expect((await processJob(fresh!, "w1")).outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });

  it("does not send if the event is deleted", async () => {
    const send = spySend();
    const { actor, id } = await completedEvent();
    const job = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000));
    await deleteEvent(id, actor);
    expect((await processJob(job!, "w1")).outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("does not send if notifications are disabled", async () => {
    const send = spySend();
    await completedEvent();
    await AppSettings.updateOne({ key: "global" }, { $set: { notificationEnabled: false } });
    const job = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000));
    expect((await processJob(job!, "w1")).outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
});

describe("persistence, idempotency and retries", () => {
  it("never enqueues the same logical job twice", async () => {
    const eventId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const results = await Promise.all(
      Array.from({ length: 10 }, () => enqueueJob({ jobType: "thank_you", idempotencyKey: "k1", scheduledAt: new Date(), eventId }))
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await ScheduledJob.countDocuments({ idempotencyKey: "k1" })).toBe(1);
  });

  it("lets only one worker claim a given job", async () => {
    for (let i = 0; i < 5; i++) await enqueueJob({ jobType: "event_update", idempotencyKey: `k${i}`, scheduledAt: new Date(Date.now() - 1000) });
    const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => claimNextJob(`w${i}`)));
    const ids = claims.filter(Boolean).map((j) => String(j!._id));
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("does not lose jobs across a restart and recovers abandoned processing jobs", async () => {
    const send = spySend();
    await completedEvent();
    // Worker claims the job then "crashes" before sending.
    const job = await claimNextJob("dead-worker", new Date(Date.now() + FIVE_MIN + 1000));
    await ScheduledJob.updateOne({ _id: job!._id }, { $set: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
    const { disconnectDB, connectDB } = await import("@/lib/mongodb");
    await disconnectDB();
    await connectDB();
    expect(await recoverAbandonedJobs()).toBe(1);
    const again = await claimNextJob("new-worker", new Date(Date.now() + FIVE_MIN + 1000));
    expect(String(again!._id)).toBe(String(job!._id));
    expect((await processJob(again!, "new-worker")).outcome).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });

  it("never resends an email that was already sent", async () => {
    const send = spySend();
    await completedEvent();
    const job = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000));
    await processJob(job!, "w1");
    // Simulate a crash after SMTP accepted but before the job was marked complete.
    await ScheduledJob.updateOne({ _id: job!._id }, { $set: { status: "processing", lockedBy: "w2", lockedAt: new Date() } });
    const reclaimed = await ScheduledJob.findById(job!._id).lean();
    expect((await processJob(reclaimed!, "w2")).outcome).toBe("duplicate_prevented");
    expect(send).toHaveBeenCalledTimes(1);
    await expect(retryJob(String(job!._id), "admin")).rejects.toMatchObject({ status: 400 });
    send.mockRestore();
  });

  it("marks interrupted sends as uncertain instead of auto-resending", async () => {
    const send = spySend();
    await completedEvent();
    const job = await claimNextJob("w1", new Date(Date.now() + FIVE_MIN + 1000));
    await NotificationLog.create({ idempotencyKey: job!.idempotencyKey, notificationType: "thank_you", status: "sending" });
    expect((await processJob(job!, "w1")).outcome).toBe("uncertain");
    expect(send).not.toHaveBeenCalled();
    expect((await NotificationLog.findOne({ idempotencyKey: job!.idempotencyKey }).lean())?.status).toBe("uncertain");
    // Explicit admin retry is allowed.
    await retryJob(String(job!._id), "admin");
    const r = await runWorkerTick({ workerId: "w3" });
    void r;
    const due = await claimNextJob("w3", new Date(Date.now() + FIVE_MIN + 1000));
    if (due) await processJob(due, "w3");
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });

  it("retries failed sends with backoff, then gives up", async () => {
    const send = vi.spyOn(email, "sendEmail").mockRejectedValue(Object.assign(new Error("ECONNREFUSED"), {}));
    await completedEvent();
    let at = Date.now() + FIVE_MIN + 1000;
    const outcomes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const job = await claimNextJob("w1", new Date(at));
      if (!job) break;
      outcomes.push((await processJob(job, "w1")).outcome);
      at += 2 * 60 * 60 * 1000; // jump past any backoff
    }
    expect(outcomes).toEqual(["retry", "retry", "retry", "failed"]);
    const job = await ScheduledJob.findOne({ jobType: "thank_you" }).lean();
    expect(job?.status).toBe("failed");
    expect(job?.retryCount).toBe(4);
    expect((await NotificationLog.findOne({ notificationType: "thank_you" }).lean())?.status).toBe("failed");
    send.mockRestore();
  });
});

describe("other notifications", () => {
  it("announces instant parties and debounces event updates", async () => {
    const actor = await makeAdmin();
    await createEvent(CreateEventSchema.parse(baseEvent({ eventType: "instant", eventDate: undefined })), actor);
    expect(await ScheduledJob.countDocuments({ jobType: "instant_announcement" })).toBe(1);
    const e = await createEvent(CreateEventSchema.parse(baseEvent()), actor);
    // Pretend the "new party" email already went out, so changes now get their own update email.
    await ScheduledJob.updateMany({ jobType: "event_scheduled" }, { $set: { status: "completed" } });
    const day = 24 * 3600 * 1000;
    await updateEvent(String(e._id), { eventDate: new Date(Date.now() + 5 * day) }, actor);
    await updateEvent(String(e._id), { eventDate: new Date(Date.now() + 6 * day) }, actor);
    expect(await ScheduledJob.countDocuments({ jobType: "event_update" })).toBe(1);
  });

  it("only a date or party-giver change notifies participants", async () => {
    const actor = await makeAdmin();
    const e = await createEvent(CreateEventSchema.parse(baseEvent()), actor);
    await ScheduledJob.updateMany({ jobType: "event_scheduled" }, { $set: { status: "completed" } });
    await updateEvent(String(e._id), { location: "Rooftop", title: "Renamed", description: "New menu" }, actor);
    expect(await ScheduledJob.countDocuments({ jobType: "event_update" })).toBe(0);
    await updateEvent(String(e._id), { organizerName: "Priya", organizerEmail: "priya@team.test" }, actor);
    expect(await ScheduledJob.countDocuments({ jobType: "event_update" })).toBe(1);
  });

  it("enqueues a single reminder per interval and never duplicates on rescans", async () => {
    const actor = await makeAdmin();
    await createEvent(CreateEventSchema.parse(baseEvent({ eventDate: new Date(Date.now() + 60 * 60 * 1000) })), actor);
    await enqueueRecurringNotifications();
    await enqueueRecurringNotifications();
    const jobs = await ScheduledJob.find({ jobType: "upcoming_reminder" }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload.hoursBefore).toBe(2);
  });
});
