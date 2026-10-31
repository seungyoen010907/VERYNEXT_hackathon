// POST: NDA 테스트 동의 / 철회 (양수인). 실제 전자서명이 아니라 "테스트 동의(법적 효력 없음)" 기록이다.

import { NextResponse } from "next/server";
import { reanswerAfterAccessLoss } from "@/lib/agents";
import { audit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { getListing } from "@/lib/listings";
import { NDA_VERSION } from "@/lib/nda";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 120; // 철회 뒤 AI 답을 다시 계산한다

export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/nda">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    if (listing.seller_id === user.id) throw new HttpError(400, "내 매물에는 NDA가 필요 없어요.");
    if (listing.status !== "published") throw new HttpError(404, "매물을 찾을 수 없어요.");
    const body = await request.json().catch(() => ({}));
    if (typeof body.agree !== "boolean") throw new HttpError(400, "동의 여부(agree)를 보내주세요.");

    const now = new Date().toISOString();
    const row: Record<string, string | null> = body.agree
      ? { listing_id: id, buyer_id: user.id, version: NDA_VERSION, status: "test_agreed", agreed_at: now, revoked_at: null }
      : { listing_id: id, buyer_id: user.id, version: NDA_VERSION, status: "revoked", revoked_at: now };
    const { data, error } = await getSupabase()
      .from("ndas")
      .upsert(row, { onConflict: "listing_id,buyer_id" })
      .select("status, version, agreed_at, revoked_at")
      .single();
    if (error) throw error;
    await audit(user.id, body.agree ? "nda_agree" : "nda_revoke", id, `NDA ${NDA_VERSION} (테스트 동의, 법적 효력 없음)`);
    if (!body.agree) await reanswerAfterAccessLoss(id, user.id);
    return NextResponse.json({ nda: data });
  } catch (e) {
    return handleError(e);
  }
}
