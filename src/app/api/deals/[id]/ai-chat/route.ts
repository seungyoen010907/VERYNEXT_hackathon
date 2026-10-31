import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, readJson } from "@/server/http";
import { askDealAgent, listAiMessages } from "@/server/deals/agent";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/ai-chat">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await listAiMessages(db, viewer, id));
  });
}

/** AI에게 질문. 질문과 답변은 질문한 사람에게만 보인다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/ai-chat">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const { message } = await readJson(request, z.object({ message: z.string().trim().min(1).max(2000) }));
    return ok(await askDealAgent(db, viewer, id, message), 201);
  });
}
