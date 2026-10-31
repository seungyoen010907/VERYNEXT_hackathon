import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { getAnalysisBundle } from "@/server/repo/analyses";

/** 분석 1건의 전체 결과 (매출 검증·수익성·권리금·위험도·보고서) */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await getAnalysisBundle(db, viewer, id));
  });
}
