import { ok, readJson, route } from "@/lib/api/handler";
import type { IdContext } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { UserUpdateSchema } from "@/lib/validation";
import { deleteUser, getUser, updateUser } from "@/services/user.service";

export const GET = route<IdContext>(async (req, ctx) => {
  await requireAdminApi(req);
  const { id } = await ctx.params;
  return ok(await getUser(id));
});

export const PATCH = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  return ok(await updateUser(id, UserUpdateSchema.parse(await readJson(req)), admin));
});

export const DELETE = route<IdContext>(async (req, ctx) => {
  const admin = await requireAdminApi(req);
  const { id } = await ctx.params;
  await deleteUser(id, admin);
  return ok({ deleted: true });
});
