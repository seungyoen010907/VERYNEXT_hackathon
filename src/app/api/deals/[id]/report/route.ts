import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { buildDealReport, saveDealReport } from "@/server/deals/report";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/report">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await buildDealReport(db, viewer, id));
  });
}

/** 현재 상태로 거래 보고서를 확정 저장한다 (이력 보존) */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/report">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await saveDealReport(db, viewer, id), 201);
  });
}
