import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { comparisonData } from "@/server/views";

/** GET /api/compare?ids=a,b,c — 점포별 최근 완료 분석 결과 비교 (최대 6개) */
export async function GET(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
    return ok(await comparisonData(db, viewer, ids));
  });
}
