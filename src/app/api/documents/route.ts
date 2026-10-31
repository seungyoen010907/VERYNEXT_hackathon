import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest } from "@/server/errors";
import { handle, ok } from "@/server/http";
import { analyzeDocument, type ImportResult } from "@/server/ingest/service";
import { fulfillRequests } from "@/server/repo/diligence";
import { documentTypeSchema, uploadDocument } from "@/server/repo/documents";
import { getStore } from "@/server/repo/stores";
import { AppError } from "@/server/errors";

const fieldsSchema = z.object({
  storeId: z.uuid("storeId가 올바르지 않습니다"),
  documentType: documentTypeSchema,
  replacesDocumentId: z.uuid().optional(),
  /** "false"면 업로드만 하고 분석은 하지 않는다 */
  analyze: z.enum(["true", "false"]).default("true"),
});

/**
 * 증빙 자료 업로드 (multipart/form-data: storeId, documentType, file, replacesDocumentId?, analyze?)
 * 업로드 후 연결된 문서 분석 모듈이 있으면 바로 분석한다. 분석 실패는 업로드 성공과 별도로 알려준다.
 */
export async function POST(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("multipart/form-data 형식으로 보내주세요.");
    }
    const fields = fieldsSchema.parse({
      storeId: form.get("storeId"),
      documentType: form.get("documentType"),
      replacesDocumentId: form.get("replacesDocumentId") || undefined,
      analyze: form.get("analyze") ?? undefined,
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("file 필드에 파일을 첨부하세요.");

    const upload = await uploadDocument(db, viewer, {
      storeId: fields.storeId,
      documentType: fields.documentType,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      replacesDocumentId: fields.replacesDocumentId ?? null,
    });

    let analysis: ImportResult | null = null;
    let analysisError: { code: string; message: string } | null = null;
    if (fields.analyze === "true") {
      try {
        analysis = await analyzeDocument(db, viewer, upload.document.id);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        analysisError = { code: err.code, message: err.message };
      }
    }
    await fulfillRequests(db, await getStore(db, viewer, fields.storeId));
    return ok({ ...upload, analysis, analysisError }, 201);
  });
}
