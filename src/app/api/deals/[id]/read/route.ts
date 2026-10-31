import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { getDealContext, markRead } from "@/server/deals/repo";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/read">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    await getDealContext(db, viewer, id);
    await markRead(db, id, viewer.id);
    return ok({ read: true });
  });
}
