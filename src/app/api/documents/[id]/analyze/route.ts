import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { analyzeDocument } from "@/server/ingest/service";
import { fulfillRequests } from "@/server/repo/diligence";
import { getDocument } from "@/server/repo/documents";
import { getStore } from "@/server/repo/stores";

/** 업로드된 문서를 연결된 문서 분석 모듈로 (다시) 분석한다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/analyze">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const result = await analyzeDocument(db, viewer, id);
    const doc = await getDocument(db, viewer, id);
    await fulfillRequests(db, await getStore(db, viewer, doc.storeId));
    return ok(result);
  });
}
