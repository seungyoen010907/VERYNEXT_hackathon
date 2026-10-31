// GET: AI 실사 상세 — 매물별 질문·답·상태 + 코드로 계산한 통합 비교 + 저장된 AI 통합 분석
// 대화창에 끼워 넣을 사건(NDA 동의 시각, 열람 승인·거절 시각)도 같이 준다.

import { NextResponse } from "next/server";
import type { AgentMessage } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { buildComparison } from "@/lib/compare";
import { handleError, HttpError } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: Request, ctx: RouteContext<"/api/agent/tasks/[id]">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "실사를 찾을 수 없어요.");
    const supabase = getSupabase();
    const { data: task, error } = await supabase.from("agent_tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!task || task.buyer_id !== user.id) throw new HttpError(404, "실사를 찾을 수 없어요.");

    const listingIds = task.listing_ids as string[];
    const [messages, summary, comparison, ndas, grants] = await Promise.all([
      supabase.from("agent_messages").select("*").eq("buyer_id", user.id).in("listing_id", listingIds).order("created_at"),
      supabase.from("comparison_reports").select("created_at, result").eq("buyer_id", user.id).contains("criteria", { task_id: id }).order("created_at", { ascending: false }).limit(1),
      buildComparison(user, listingIds),
      supabase.from("ndas").select("listing_id, status, agreed_at").eq("buyer_id", user.id).in("listing_id", listingIds),
      supabase.from("access_grants").select("id, listing_id, status, created_at, decided_at").eq("buyer_id", user.id).in("listing_id", listingIds),
    ]);
    if (messages.error) throw messages.error;
    if (summary.error) throw summary.error;
    if (ndas.error) throw ndas.error;
    if (grants.error) throw grants.error;

    return NextResponse.json({
      task,
      messages: messages.data as AgentMessage[],
      comparison,
      nda: Object.fromEntries((ndas.data ?? []).map((n) => [n.listing_id, n.status])),
      nda_agreed_at: Object.fromEntries((ndas.data ?? []).filter((n) => n.status === "test_agreed").map((n) => [n.listing_id, n.agreed_at])),
      grants: grants.data ?? [],
      ai_summary: summary.data?.[0] ?? null,
    });
  } catch (e) {
    return handleError(e);
  }
}
