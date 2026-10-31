import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { ANALYSIS_PARTS, runAnalysisParts } from "@/server/repo/analyses";

/** POST /api/analysis/:id/full — 매출 검증·수익성·권리금·위험도를 모두 실행하고 분석을 완료 처리한다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]/full">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await runAnalysisParts(db, viewer, id, ANALYSIS_PARTS));
  });
}
