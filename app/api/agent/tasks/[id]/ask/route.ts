// POST: 대화창에서 양수인이 직접 질문한다 { listing_id, question }. 질문은 바로 저장되고,
// 응답 뒤에 내 AI가 필요한 자료 범위를 확인하고 그 매물의 양도인 AI가 허용된 자료로만 답한다.

import { after, NextResponse } from "next/server";
import { askQuestion } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/agent/tasks/[id]/ask">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "실사를 찾을 수 없어요.");
    const body = await request.json().catch(() => ({}));
    if (typeof body.listing_id !== "string" || typeof body.question !== "string") throw new HttpError(400, "매물(listing_id)과 질문(question)을 보내주세요.");
    const { message, run } = await askQuestion(user, id, body.listing_id, body.question);
    after(run);
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
