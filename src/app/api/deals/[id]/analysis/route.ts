import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, readJson } from "@/server/http";
import { getEligibility, listFindings, listRuns, runDealAnalysis } from "@/server/deals/agent";
import { getDealContext } from "@/server/deals/repo";

/** 분석 가능 여부, 분석 이력, 위험 항목 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/analysis">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const c = await getDealContext(db, viewer, id);
    const [eligibility, runs, findings] = await Promise.all([getEligibility(db, c), listRuns(db, id), listFindings(db, id)]);
    // 양도인에게는 위험 항목을 보내지 않는다 (양수인의 검토 내용)
    return ok({ eligibility: { ...eligibility, lastRun: undefined }, runs: c.role === "buyer" ? runs : [], findings: c.role === "buyer" ? findings : [] });
  });
}

/** AI 거래 분석 실행. 조건 미충족·같은 입력이면 409. force는 조건을 무시하지만 중복 입력은 막는다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/analysis">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const { force } = await readJson(request, z.object({ force: z.boolean().default(false) }));
    return ok(await runDealAnalysis(db, viewer, id, { force }), 201);
  });
}
