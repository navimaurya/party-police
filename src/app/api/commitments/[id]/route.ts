import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { CommitmentUpdateSchema } from "@/lib/validation";
import { deleteCommitment, updateCommitment } from "@/services/commitment.service";

export const PATCH = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  return ok(await updateCommitment(id, CommitmentUpdateSchema.parse(await readJson(req)), admin.id));
});

export const DELETE = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  await deleteCommitment(id, admin.id);
  return ok({ deleted: true });
});
