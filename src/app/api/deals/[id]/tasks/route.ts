import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { getDealContext } from "@/server/deals/repo";
import { addTask, listTasks, newTaskSchema } from "@/server/deals/tasks";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/tasks">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    await getDealContext(db, viewer, id);
    return ok(await listTasks(db, id));
  });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/tasks">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    await getDealContext(db, viewer, id);
    return ok(await addTask(db, id, await readJson(request, newTaskSchema), "user"), 201);
  });
}
