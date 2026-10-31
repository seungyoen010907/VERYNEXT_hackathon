import type { NextRequest } from "next/server";
import { badRequest } from "@/server/errors";
import { handle, ok } from "@/server/http";
import { documentTypeSchema } from "@/server/repo/documents";
import { shareFile } from "@/server/deals/repo";

/** 메신저 파일 공유 (multipart: file, documentType, body?). 파일은 증빙자료로 저장된다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/files">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("multipart/form-data 형식으로 보내주세요.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("file 필드에 파일을 첨부하세요.");
    const documentType = documentTypeSchema.parse(form.get("documentType") ?? "other");
    const body = typeof form.get("body") === "string" ? String(form.get("body")).slice(0, 5000) : "";
    return ok(await shareFile(db, viewer, id, { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), documentType, body }), 201);
  });
}
