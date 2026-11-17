import { AuditLog } from "@/models";

export async function audit(entry: {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}) {
  try {
    await AuditLog.create({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      actorId: entry.actorId ?? null,
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
      reason: entry.reason ?? "",
    });
  } catch (err) {
    // Audit failures must never break the primary operation, but must be visible.
    console.error("[audit] failed to write audit log", err);
  }
}

export async function listAuditLogs(opts: { page: number; limit: number; entityType?: string; action?: string }) {
  const filter: Record<string, unknown> = {};
  if (opts.entityType) filter.entityType = opts.entityType;
  if (opts.action) filter.action = opts.action;
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, total };
}
