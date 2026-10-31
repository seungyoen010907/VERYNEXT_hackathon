import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { getDealContext, listMessages, sendMessage, sendMessageSchema } from "@/server/deals/repo";

/** ?after=seq 로 그 이후 메시지만 받는다 (새 메시지 확인용) */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/messages">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const after = Number(request.nextUrl.searchParams.get("after") ?? 0);
    const c = await getDealContext(db, viewer, id);
    return ok(await listMessages(db, c, { afterSeq: Number.isFinite(after) ? after : 0 }));
  });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/messages">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const input = await readJson(request, sendMessageSchema);
    return ok(await sendMessage(db, viewer, id, input), 201);
  });
}
