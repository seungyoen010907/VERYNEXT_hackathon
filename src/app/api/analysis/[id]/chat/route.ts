import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { askQuestion, chatInputSchema, listChat } from "@/server/repo/chat";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]/chat">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await listChat(db, viewer, id));
  });
}

/** 저장된 실사 결과를 근거로 질문에 답한다. 질문과 답변을 함께 저장한다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]/chat">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const { message } = await readJson(request, chatInputSchema);
    return ok(await askQuestion(db, viewer, id, message), 201);
  });
}
