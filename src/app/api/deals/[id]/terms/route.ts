import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { getDealContext, listTermChanges, termsPatchSchema, updateTerms } from "@/server/deals/repo";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/terms">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const c = await getDealContext(db, viewer, id);
    return ok({ terms: c.deal.terms, history: await listTermChanges(db, id) });
  });
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/terms">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await updateTerms(db, viewer, id, await readJson(request, termsPatchSchema)));
  });
}
