import { ok, readJson, route } from "@/lib/api/handler";
import { requireAdminApi } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { signedFileUrl } from "@/lib/signed-url";
import { SignFileSchema } from "@/lib/validation";
import { getFileForAccess } from "@/services/bill.service";
import { audit } from "@/services/audit.service";

/** Admin-only: create a short-lived signed link for one file + operation. */
export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  const { fileId, op, ttlSeconds } = SignFileSchema.parse(await readJson(req));
  if (!(await getFileForAccess(fileId))) throw notFound("File not found");
  const signed = signedFileUrl(fileId, op, ttlSeconds);
  await audit({ action: "file.sign", entityType: "PartyBill", entityId: fileId, actorId: admin.id, newValue: { op, ttlSeconds } });
  return ok(signed);
});
