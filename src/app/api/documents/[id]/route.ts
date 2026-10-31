import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { getDocument } from "@/server/repo/documents";
import { readStoredFile } from "@/server/storage";

/** 문서 정보. ?download=1 이면 원본 파일을 내려준다 (매물 소유자만). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const doc = await getDocument(db, viewer, id);
    if (request.nextUrl.searchParams.get("download") !== "1") return ok(doc);
    const bytes = await readStoredFile(doc.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
