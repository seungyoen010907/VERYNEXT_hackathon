// PATCH: AI가 추출한 값을 양도인이 고친다. 고친 값은 신뢰 수준이 "점주 진술"로 바뀐다 (PRD 7.2).

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { assertOwner, getListing } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";

export async function PATCH(request: Request, ctx: RouteContext<"/api/data-points/[id]">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "값을 찾을 수 없어요.");
    const supabase = getSupabase();
    const { data: point, error } = await supabase.from("data_points").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!point) throw new HttpError(404, "값을 찾을 수 없어요.");
    assertOwner(user, await getListing(point.listing_id));

    const body = await request.json().catch(() => {
      throw new HttpError(400, "요청 형식이 올바르지 않아요.");
    });
    const value = Number(body.value);
    if (body.value === null || body.value === "" || !Number.isFinite(value) || value < 0 || value > 10_000_000_000) {
      throw new HttpError(400, "0~100억 사이의 숫자를 입력해주세요.");
    }

    // 처음 고칠 때만 원래 값을 출처에 남긴다 (여러 번 고쳐도 한 번만)
    const sourceNote =
      point.trust_level === "owner_stated"
        ? point.source_note
        : `양도인이 수정 (${point.source_note ?? "자료"} · 원래 값 ${Number(point.value).toLocaleString("ko-KR")}원)`;
    const { data, error: updateError } = await supabase
      .from("data_points")
      .update({ value, trust_level: "owner_stated", source_note: sourceNote })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ data_point: data });
  } catch (e) {
    return handleError(e);
  }
}
