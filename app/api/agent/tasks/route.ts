// GET: 내 AI 실사 목록 / POST: AI 실사 시작 — 양수인 AI가 매물(최대 3개)의 양도인 AI에 동시에 질문한다

import { NextResponse } from "next/server";
import { startTask } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { handleError } from "@/lib/http";
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
    const ids = Array.isArray(body.listing_ids) ? body.listing_ids.map(String) : [];
    const taskId = await startTask(user, ids);
    return NextResponse.json({ task_id: taskId }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
