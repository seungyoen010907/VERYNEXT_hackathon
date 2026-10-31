// POST: AI 분석이 실패한 자료를 다시 분석한다 (소유 양도인). 이미 분석된 자료는 다시 분석하지 않는다.

import { NextResponse } from "next/server";
import { handleError } from "@/lib/http";
import { analyzeDocument, getOwnedDocument } from "@/lib/listings";

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/analyze">) {
  try {
    const { id } = await ctx.params;
    const { doc } = await getOwnedDocument(request, id);
    const analyzed = await analyzeDocument(doc);
    return NextResponse.json({ document: { ...analyzed, storage_path: undefined, deal_id: undefined } });
  } catch (e) {
    return handleError(e);
  }
}
