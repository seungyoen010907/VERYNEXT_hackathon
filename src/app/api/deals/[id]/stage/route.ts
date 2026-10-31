import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { setStage, stageSchema } from "@/server/deals/repo";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/stage">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await setStage(db, viewer, id, await readJson(request, stageSchema)));
  });
}
