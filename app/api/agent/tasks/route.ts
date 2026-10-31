// GET: 내 AI 실사 목록 / POST: AI 실사 시작 — 양수인 AI가 매물(최대 3개)의 양도인 AI에 동시에 질문한다
// listing_ids 대신 { auto: true }를 보내면 인수 조건 기준 추천 상위 3개를 골라 시작한다.
// 실사만 만들고 바로 응답하고, 질문·답은 응답 뒤(after)에 진행된다. 화면은 GET /api/agent/tasks/[id]로 진행 상황을 본다.

import { after, NextResponse } from "next/server";
import { pickRecommended, startTask } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 300; // 매물 3개 × 질문 여러 개, AI 호출 포함

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const { data, error } = await getSupabase().from("agent_tasks").select("*").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return NextResponse.json({ tasks: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    const body = await request.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body.listing_ids) ? body.listing_ids.map(String) : [];
    if (body.auto === true) {
      if (!user.roles.includes("buyer")) throw new HttpError(403, "양수인만 AI 실사를 시작할 수 있어요.");
      ids = await pickRecommended(user);
      if (ids.length === 0) return NextResponse.json({ task_id: null, listing_ids: [] });
    }
    const { taskId, run } = await startTask(user, ids);
    after(run);
    return NextResponse.json({ task_id: taskId, listing_ids: ids }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
