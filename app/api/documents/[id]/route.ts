// PATCH: 자료의 공개 등급(원본 / 추출 요약 따로)과 분류를 바꾼다 (소유 양도인)

import { NextResponse } from "next/server";
import { handleError, HttpError } from "@/lib/http";
import { DOCUMENT_COLUMNS, getOwnedDocument } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import { ACCESS_LEVELS, DOC_CATEGORIES, type AccessLevel, type DocCategory } from "@/lib/types";

export async function PATCH(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  try {
    const { id } = await ctx.params;
    await getOwnedDocument(request, id);
    const body = await request.json().catch(() => {
      throw new HttpError(400, "요청 형식이 올바르지 않아요.");
    });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of ["access_level", "summary_access_level"] as const) {
      if (field in body) {
        if (!ACCESS_LEVELS.includes(body[field] as AccessLevel)) throw new HttpError(400, "공개 등급은 L0~L3 중 하나여야 해요.");
        update[field] = body[field];
      }
    }
    if ("category" in body) {
      if (!DOC_CATEGORIES.includes(body.category as DocCategory)) throw new HttpError(400, "자료 분류가 올바르지 않아요.");
      update.category = body.category;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.from("documents").update(update).eq("id", id).select(DOCUMENT_COLUMNS).single();
    if (error) throw error;
    // 추출값의 공개 등급은 "추출 요약" 등급을 따른다
    if (update.summary_access_level) {
      const { error: dpError } = await supabase.from("data_points").update({ access_level: update.summary_access_level }).eq("document_id", id);
      if (dpError) throw dpError;
    }
    return NextResponse.json({ document: { ...data, storage_path: undefined, deal_id: undefined } });
  } catch (e) {
    return handleError(e);
  }
}
