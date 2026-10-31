import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { getDealContext } from "@/server/deals/repo";
import { taskPatchSchema, updateTaskByUser } from "@/server/deals/tasks";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/tasks/[taskId]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id, taskId } = await ctx.params;
    await getDealContext(db, viewer, id);
    return ok(await updateTaskByUser(db, id, taskId, viewer.id, await readJson(request, taskPatchSchema)));
  });
}
