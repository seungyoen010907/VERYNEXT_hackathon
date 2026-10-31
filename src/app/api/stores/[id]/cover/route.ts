import type { NextRequest } from "next/server";
import { badRequest, notFound } from "@/server/errors";
import { handle, ok } from "@/server/http";
import { getStore, setCoverImage } from "@/server/repo/stores";
import { readStoredFile } from "@/server/storage";

/** 매물 대표 이미지 (공개 매물이면 누구나 볼 수 있다) */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/cover">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const store = await getStore(db, viewer, id);
    if (!store.coverImagePath) throw notFound("대표 이미지");
    const bytes = await readStoredFile(store.coverImagePath);
    const type = store.coverImagePath.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  });
}

/** 대표 이미지 등록 (JPG·PNG, 5MB 이하, 매물 소유자만) */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/cover">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const form = await request.formData().catch(() => {
      throw badRequest("multipart/form-data 형식으로 보내주세요.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("file 필드에 이미지를 첨부하세요.");
    return ok(await setCoverImage(db, viewer, id, file.name, new Uint8Array(await file.arrayBuffer())));
  });
}
