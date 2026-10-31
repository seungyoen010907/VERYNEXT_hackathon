// POST: 양수인 AI 질문에 양도인이 직접 글로 답한다 (그 매물의 양도인). 답은 "양도인 직접 답변(점주 진술)"으로 표시된다.

import { NextResponse } from "next/server";
import { sellerReply } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";

export async function POST(request: Request, ctx: RouteContext<"/api/agent/messages/[id]/reply">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "질문을 찾을 수 없어요.");
    const body = await request.json().catch(() => ({}));
    if (typeof body.answer !== "string") throw new HttpError(400, "답변(answer)을 보내주세요.");
    const message = await sellerReply(user, id, body.answer);
    return NextResponse.json({ message });
  } catch (e) {
    return handleError(e);
  }
}
