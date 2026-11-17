import { connectDB } from "@/lib/mongodb";
import { User } from "@/models";
import { NotificationLog, PartyBill, PartyCommitment, PartyEvent, ScheduledJob } from "@/models";

export async function getDashboardStats(now = new Date()) {
  await connectDB();
  const [
    total,
    upcoming,
    completed,
    monthly,
    pendingCommitments,
    overdueCommitments,
    totalBills,
    nextUp,
    pendingJobs,
    failedEmails,
    awaitingApproval,
    activeMembers,
  ] = await Promise.all([
    PartyEvent.countDocuments(),
    PartyEvent.countDocuments({ status: "upcoming" }),
    PartyEvent.countDocuments({ status: "completed" }),
    PartyEvent.countDocuments({ category: "monthly" }),
    PartyCommitment.countDocuments({ status: "pending" }),
    PartyCommitment.countDocuments({ status: "pending", dueDate: { $lt: now } }),
    PartyBill.countDocuments(),
    PartyEvent.findOne({ status: "upcoming", eventDate: { $gte: now } }).sort({ eventDate: 1 }).lean(),
    ScheduledJob.countDocuments({ status: { $in: ["pending", "processing"] } }),
    NotificationLog.countDocuments({ status: { $in: ["failed", "uncertain"] } }),
    // Parties whose time has come but that no admin has approved yet.
    PartyEvent.find({ status: "upcoming", eventDate: { $lte: now } })
      .sort({ eventDate: 1 })
      .limit(20)
      .select({ title: 1, organizerName: 1, eventDate: 1, category: 1 })
      .lean(),
    User.countDocuments({ isActive: true }),
  ]);
  return {
    total,
    upcoming,
    completed,
    monthly,
    pendingCommitments,
    overdueCommitments,
    totalBills,
    nextUp,
    pendingJobs,
    failedEmails,
    awaitingApproval,
    activeMembers,
  };
}
