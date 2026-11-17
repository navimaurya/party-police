import { env } from "@/config/env";
import { ok, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { getAdmin, requireAdminApi } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { BillMetaSchema, ListQuerySchema } from "@/lib/validation";
import { listBills, uploadBill } from "@/services/bill.service";

export const GET = route(async (req) => {
  const { eventId, ...rest } = searchParamsObject(req);
  const q = ListQuerySchema.parse(rest);
  const admin = await getAdmin();
  const { items, total } = await listBills({ eventId, admin: !!admin, page: q.page, limit: q.limit });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});

/** multipart/form-data: file, eventId, kind?, amount?, description?, isPublic? */
export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  const max = env().MAX_FILE_SIZE;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > max + 64 * 1024) throw badRequest(`File too large. Max ${Math.round(max / 1024 / 1024)} MB`);
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) throw badRequest("Expected multipart/form-data");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Missing file");
  if (file.size > max) throw badRequest(`File too large. Max ${Math.round(max / 1024 / 1024)} MB`);
  const meta = BillMetaSchema.parse({
    eventId: form.get("eventId"),
    kind: form.get("kind") ?? undefined,
    amount: form.get("amount") ?? undefined,
    description: form.get("description") ?? undefined,
    isPublic: form.get("isPublic") ?? undefined,
  });
  const buffer = new Uint8Array(await file.arrayBuffer());
  const bill = await uploadBill(meta, { buffer, originalName: file.name }, admin.id);
  return ok(bill, { status: 201 });
});
