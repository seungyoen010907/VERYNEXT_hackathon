import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { listActivities } from "@/server/repo/activities";
import { getStore } from "@/server/repo/stores";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/activities">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const store = await getStore(db, viewer, id);
    return ok(await listActivities(db, { storeIds: [store.id], limit: 200 }));
  });
}
