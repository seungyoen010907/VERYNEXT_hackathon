import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { runAnalysisParts } from "@/server/repo/analyses";

/** POST /api/analysis/:id/risk — 이 분석의 risk 결과만 다시 계산해 저장한다. 계산은 최신 자료 기준이다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]/risk">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await runAnalysisParts(db, viewer, id, ["risk"] as const));
  });
}
