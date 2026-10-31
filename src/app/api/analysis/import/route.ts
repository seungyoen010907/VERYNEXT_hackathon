import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, readJson } from "@/server/http";
import { importExtraction } from "@/server/ingest/service";
import { fulfillRequests } from "@/server/repo/diligence";
import { getStore } from "@/server/repo/stores";

const schema = z.object({
  storeId: z.uuid(),
  documentId: z.uuid().nullable().optional(),
  /** 문서 분석 모듈이 만든 추출 결과 JSON (스키마 v1). 원본 그대로 보존한다. */
  payload: z.unknown(),
});

/** 다른 팀원의 AI 문서 분석 결과(JSON)를 받는다. */
export async function POST(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    const body = await readJson(request, schema);
    const result = await importExtraction(db, viewer, {
      storeId: body.storeId,
      documentId: body.documentId ?? null,
      raw: body.payload,
    });
    await fulfillRequests(db, await getStore(db, viewer, body.storeId));
    return ok(result, 201);
  });
}
