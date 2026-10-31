// POST: 끝나지 않은 질문(접근 거부·자료 없음·오류)과 새로 빠진 주제를 다시 묻는다 (NDA 동의·자료 추가 뒤)

import { after, NextResponse } from "next/server";
import { rerunTask } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { handleError } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/agent/tasks/[id]/rerun">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    after(await rerunTask(user, id)); // 응답 뒤에 다시 묻는다
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
