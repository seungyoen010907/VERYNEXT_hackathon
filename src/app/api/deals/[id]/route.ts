import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { getDealContext } from "@/server/deals/repo";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const c = await getDealContext(db, viewer, id);
    return ok({ deal: c.deal, role: c.role, store: { id: c.store.id, name: c.store.name } });
  });
}
