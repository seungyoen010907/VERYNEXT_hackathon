import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { generateReport, previewReport } from "@/server/repo/reports";

/** 저장된 보고서. 아직 생성하지 않았으면 저장하지 않은 미리보기를 돌려준다 (saved: null). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]/report">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await previewReport(db, viewer, id));
  });
}

/** 보고서를 생성(또는 다시 생성)해 저장한다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/analysis/[id]/report">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await generateReport(db, viewer, id), 201);
  });
}
