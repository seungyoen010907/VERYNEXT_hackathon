// GET: 구매자 요청 관리 (소유 양도인) — 열람 요청, NDA 상태, AI 질문, 열람 기록
// POST: 잠긴 자료 열람 요청 (양수인)

import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { assertOwner, getListing } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: Request, ctx: RouteContext<"/api/listings/[id]/requests">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    assertOwner(user, await getListing(id));

    const supabase = getSupabase();
    const [grants, ndas, questions, logs, docs, users] = await Promise.all([
      supabase.from("access_grants").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
      supabase.from("ndas").select("buyer_id, status, version, agreed_at, revoked_at").eq("listing_id", id),
      supabase
        .from("agent_messages")
        .select("id, created_at, updated_at, buyer_id, question_type, topic, question, status, answer_type, answer, grant_id")
        .eq("listing_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("audit_logs").select("created_at, actor_id, action, target").eq("listing_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("documents").select("id, file_name, category, kind, access_level, summary_access_level").eq("deal_id", id),
      supabase.from("users").select("id, name"),
    ]);
    for (const r of [grants, ndas, questions, logs, docs, users]) if (r.error) throw r.error;

    return NextResponse.json({
      grants: grants.data,
      ndas: ndas.data,
      questions: questions.data,
      logs: logs.data,
      documents: docs.data,
      users: users.data,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/requests">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    if (listing.seller_id === user.id) throw new HttpError(400, "내 매물에는 요청할 수 없어요.");
    if (listing.status !== "published") throw new HttpError(404, "매물을 찾을 수 없어요.");

    const body = await request.json().catch(() => ({}));
    const type = body.target_type;
    if (type !== "document" && type !== "document_summary") throw new HttpError(400, "요청 대상이 올바르지 않아요.");
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

    const supabase = getSupabase();
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, file_name, access_level, summary_access_level")
      .eq("id", String(body.target_id ?? ""))
      .eq("deal_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new HttpError(404, "자료를 찾을 수 없어요.");

    const level = type === "document" ? doc.access_level : doc.summary_access_level;
    if (level === "L3") throw new HttpError(403, "양도인 전용 자료라 요청할 수 없어요.");
    if (level === "L0") throw new HttpError(400, "이미 공개된 자료예요.");
    const { data: nda } = await supabase.from("ndas").select("status").eq("listing_id", id).eq("buyer_id", user.id).maybeSingle();
    if (nda?.status !== "test_agreed") throw new HttpError(403, "먼저 NDA에 동의해주세요.");
    if (level === "L1") throw new HttpError(400, "NDA 동의로 이미 열람할 수 있는 자료예요.");

    // 이미 승인돼 있으면 그대로 둔다 (다시 요청해도 승인이 풀리지 않게)
    const { data: existing } = await supabase
      .from("access_grants")
      .select("*")
      .eq("listing_id", id)
      .eq("buyer_id", user.id)
      .eq("target_type", type)
      .eq("target_id", doc.id)
      .maybeSingle();
    if (existing && (existing.status === "approved" || existing.status === "requested")) {
      return NextResponse.json({ grant: existing });
    }

    const { data, error: upsertError } = await supabase
      .from("access_grants")
      .upsert(
        { listing_id: id, buyer_id: user.id, target_type: type, target_id: doc.id, status: "requested", reason: reason || null, decided_at: null, expires_at: null },
        { onConflict: "listing_id,buyer_id,target_type,target_id" },
      )
      .select("*")
      .single();
    if (upsertError) throw upsertError;
    await audit(user.id, "grant_request", id, `${doc.file_name} ${type === "document" ? "원본" : "요약"} 열람 요청`);
    return NextResponse.json({ grant: data }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
