// GET: 거래방 메시지 (?after=시각 이면 그 뒤 것만, 화면은 3초마다 부른다) / POST: 메시지 보내기
// 양도인은 ?buyer=양수인 id 로 어느 거래방인지 정한다.

import { NextResponse, type NextRequest } from "next/server";
import { openDealRoom, postMessage } from "@/lib/deals";
import { handleError, HttpError } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/messages">) {
  try {
    const { id } = await ctx.params;
    const params = request.nextUrl.searchParams;
    const room = await openDealRoom(request, id, params.get("buyer"));
    let query = getSupabase()
      .from("messages")
      .select("id, created_at, role, body")
      .eq("deal_id", id)
      .eq("buyer_id", room.buyerId)
      .order("created_at")
      .limit(200);
    const after = params.get("after");
    if (after) {
      if (Number.isNaN(Date.parse(after))) throw new HttpError(400, "after는 시각(ISO)이어야 해요.");
      query = query.gt("created_at", after);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/messages">) {
  try {
    const { id } = await ctx.params;
    const room = await openDealRoom(request, id, request.nextUrl.searchParams.get("buyer"));
    const body = await request.json().catch(() => ({}));
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) throw new HttpError(400, "메시지를 입력해주세요.");
    if (text.length > 2000) throw new HttpError(400, "메시지는 2000자까지 보낼 수 있어요.");
    const message = await postMessage(id, room.buyerId, room.myRole, text);
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
