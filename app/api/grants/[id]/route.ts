// PATCH: 열람 요청 승인·거절·회수 (그 매물의 양도인). 승인은 30일 뒤 만료된다.

import { NextResponse } from "next/server";
import { onGrantDecided } from "@/lib/agents";
import { audit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { assertOwner, getListing } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";

const APPROVAL_DAYS = 30;

export const maxDuration = 120; // 승인 뒤 양도인 AI가 다시 답한다

export async function PATCH(request: Request, ctx: RouteContext<"/api/grants/[id]">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "요청을 찾을 수 없어요.");
    const supabase = getSupabase();
    const { data: grant, error } = await supabase.from("access_grants").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!grant) throw new HttpError(404, "요청을 찾을 수 없어요.");
    assertOwner(user, await getListing(grant.listing_id));

    const body = await request.json().catch(() => ({}));
    const now = new Date();
    let update: Record<string, unknown>;
    if (body.action === "approve") {
      update = { status: "approved", decided_at: now.toISOString(), expires_at: new Date(now.getTime() + APPROVAL_DAYS * 86_400_000).toISOString() };
    } else if (body.action === "reject") {
      update = { status: "rejected", decided_at: now.toISOString(), expires_at: null };
    } else if (body.action === "revoke") {
      if (grant.status !== "approved") throw new HttpError(400, "승인된 요청만 회수할 수 있어요.");
      update = { status: "revoked", decided_at: now.toISOString(), expires_at: null };
    } else {
      throw new HttpError(400, "action은 approve, reject, revoke 중 하나여야 해요.");
    }

    const { data, error: updateError } = await supabase.from("access_grants").update(update).eq("id", id).select("*").single();
    if (updateError) throw updateError;
    const { data: doc } = await supabase.from("documents").select("file_name").eq("id", grant.target_id).maybeSingle();
    const target = `${doc?.file_name ?? "자료"} ${grant.target_type === "document" ? "원본" : "요약"}`;
    await audit(user.id, `grant_${body.action}` as "grant_approve" | "grant_reject" | "grant_revoke", grant.listing_id, target);
    // 이 승인을 기다리던 양수인 AI 질문을 다시 처리한다 (승인되면 답, 거절되면 거절)
    await onGrantDecided(data);
    return NextResponse.json({ grant: data });
  } catch (e) {
    return handleError(e);
  }
}
