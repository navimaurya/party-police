import { ok, readJson, route } from "@/lib/api/handler";
import { pageMeta, searchParamsObject } from "@/lib/api/params";
import { getAdmin, requireAdminApi } from "@/lib/auth";
import { CommitmentCreateSchema, CommitmentListQuerySchema } from "@/lib/validation";
import { createCommitment, getHallOfShame, getPartyLegends, listCommitments } from "@/services/commitment.service";

/** ?view=shame | legends for the public leaderboards; otherwise a paginated list. */
export const GET = route(async (req) => {
  const { view, ...rest } = searchParamsObject(req);
  if (view === "shame") return ok(await getHallOfShame({ admin: false }));
  if (view === "legends") return ok(await getPartyLegends());
  const admin = await getAdmin();
  const q = CommitmentListQuerySchema.parse(rest);
  const { items, total } = await listCommitments(q, { admin: !!admin });
  return ok(items, { meta: pageMeta(q.page, q.limit, total) });
});

export const POST = route(async (req) => {
  const admin = await requireAdminApi(req);
  const input = CommitmentCreateSchema.parse(await readJson(req));
  return ok(await createCommitment(input, admin.id), { status: 201 });
});
