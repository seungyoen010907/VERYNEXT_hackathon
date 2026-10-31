import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { createAndRunFullAnalysis, listStoreAnalyses } from "@/server/repo/analyses";
import { getStore } from "@/server/repo/stores";

/** 분석 이력 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/analyses">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const store = await getStore(db, viewer, id);
    return ok(await listStoreAnalyses(db, store.id));
  });
}

/** 새 분석을 만들고 종합 분석까지 실행한다. 이전 분석은 이력으로 남는다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/analyses">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await createAndRunFullAnalysis(db, viewer, id), 201);
  });
}
