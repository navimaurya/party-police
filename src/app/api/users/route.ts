import { ok, readJson, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { requireAdminApi } from "@/lib/auth";
import { UserCreateSchema, UserListQuerySchema } from "@/lib/validation";
import { createUser, listUsers } from "@/services/user.service";

/** Admin only: users include emails and phone numbers. */
export const GET = route(async (req) => {
  await requireAdminApi(req);
  const q = UserListQuerySchema.parse(searchParamsObject(req));
  const { items, total, summary } = await listUsers(q);
  return ok({ items, summary }, { meta: pageMeta(q.page, q.limit, total) });
});

export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  const input = UserCreateSchema.parse(await readJson(req));
  return ok(await createUser(input, admin), { status: 201 });
});
