// POST: 데이터룸에 자료 업로드 (소유 양도인) → Storage 저장 → AI 분석 → 추출값 저장
// AI가 실패해도 자료는 저장된다 (PRD 11.5).

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { analyzeDocument, assertOwner, createDocument, getListing, VIRTUAL_KINDS_FILTER } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/types";

export const maxDuration = 120; // AI 분석 포함 (Vercel 배포용)

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_DOCS = 30;

export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/documents">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    assertOwner(user, listing);

    const form = await request.formData().catch(() => {
      throw new HttpError(400, "파일을 multipart/form-data로 보내주세요.");
    });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "올릴 파일을 골라주세요.");
    if (file.size > MAX_SIZE) throw new HttpError(400, "파일은 10MB까지 올릴 수 있어요.");
    const category = String(form.get("category") ?? "other");
    if (!DOC_CATEGORIES.includes(category as DocCategory)) throw new HttpError(400, "자료 분류가 올바르지 않아요.");

    const supabase = getSupabase();
    const { count, error: countError } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("deal_id", id).not("kind", "in", VIRTUAL_KINDS_FILTER);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_DOCS) throw new HttpError(400, `매물 하나에 자료는 ${MAX_DOCS}개까지 올릴 수 있어요.`);

    const doc = await createDocument(id, file.name, new Uint8Array(await file.arrayBuffer()), category as DocCategory);
    const analyzed = await analyzeDocument(doc);
    return NextResponse.json({ document: { ...analyzed, storage_path: undefined, deal_id: undefined } }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
