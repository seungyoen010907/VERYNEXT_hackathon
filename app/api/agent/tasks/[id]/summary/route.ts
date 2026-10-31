// POST: 양수인 AI 통합 분석 — 코드로 계산한 비교 결과와 받은 답을 AI가 글로 정리한다 (숫자는 코드 계산값만)

import { NextResponse } from "next/server";
import type { AgentMessage } from "@/lib/agents";
import { getUser } from "@/lib/auth";
import { buildComparison } from "@/lib/compare";
import { won } from "@/lib/format";
import { handleError, HttpError } from "@/lib/http";
import { summarizeDiligence } from "@/lib/openai";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 120;

const show = (v: number | null, unit: "won" | "month" | "pct" = "won") =>
  v === null ? "미확인" : unit === "won" ? won(v) : unit === "month" ? `${v}개월` : `${v}%`;

export async function POST(request: Request, ctx: RouteContext<"/api/agent/tasks/[id]/summary">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const supabase = getSupabase();
    const { data: task, error } = await supabase.from("agent_tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!task || task.buyer_id !== user.id) throw new HttpError(404, "실사를 찾을 수 없어요.");

    const comparison = await buildComparison(user, task.listing_ids);
    const { data: messages } = await supabase.from("agent_messages").select("*").eq("buyer_id", user.id).in("listing_id", task.listing_ids);
    const input = {
      양수인_조건: comparison.profile,
      매물: comparison.rows.map((r) => ({
        이름: r.facts.listing.name,
        추천점수: `${r.recommendation.total}/100`,
        초기투자금: show(r.facts.initial_investment.value),
        월평균매출: show(r.facts.monthly_sales_avg.value),
        월평균비용: show(r.facts.monthly_cost_avg.value),
        확인된_월순수익: show(r.facts.confirmed_profit.value),
        예상_월순수익_내조건: show(r.fit.expected_profit.value),
        투자금_회수기간: show(r.fit.payback_months.value, "month"),
        점주_주당근무: r.facts.owner_weekly_hours.value === null ? "미확인" : `${r.facts.owner_weekly_hours.value}시간`,
        임대차_남은기간: show(r.facts.lease_remaining_months.value, "month"),
        검증등급: r.facts.report_grade.value ?? "미확인",
        주장매출_대비_차이: show(r.facts.claimed_gap.value, "pct"),
        위험: r.risks.slice(0, 3).map((x) => x.title),
        미확인: r.unknowns,
        양도인AI_답변: ((messages ?? []) as AgentMessage[])
          .filter((m) => m.listing_id === r.facts.listing.id)
          .map((m) => ({ 주제: m.topic, 상태: m.status, 답: m.answer })),
      })),
    };
    const result = await summarizeDiligence(input);
    const { data, error: saveError } = await supabase
      .from("comparison_reports")
      .insert({ buyer_id: user.id, listing_ids: task.listing_ids, criteria: { task_id: id, weights: comparison.weights }, result })
      .select("created_at, result")
      .single();
    if (saveError) throw saveError;
    return NextResponse.json({ ai_summary: data }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
