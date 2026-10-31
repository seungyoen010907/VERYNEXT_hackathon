// PATCH: 체크리스트 항목 완료/취소, 인수인계 항목 '확인 완료'. 단계가 바뀌면 에이전트 메시지를 남긴다.
// - 자기 역할 항목만 바꾼다. 자료 제출 항목(auto)은 데이터룸 자료로 저절로 체크되므로 직접 못 바꾼다.
// - 인수인계(confirm) 항목: 양도인이 '완료' → 양수인이 '확인 완료'. 양도인이 취소하면 확인도 풀린다.

import { NextResponse } from "next/server";
import { announceStageChange, currentStage, loadRoomChecklist, openDealRoom } from "@/lib/deals";
import { handleError, HttpError } from "@/lib/http";
import { templateFor } from "@/lib/roadmap";
import { getSupabase } from "@/lib/supabase";
import type { ChecklistStatus } from "@/lib/types";

const STATUSES: ChecklistStatus[] = ["todo", "done", "confirmed"];

export async function PATCH(request: Request, ctx: RouteContext<"/api/deals/[id]/checklist/[itemId]">) {
  try {
    const { id, itemId } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new HttpError(404, "체크리스트 항목을 찾을 수 없어요.");
    const supabase = getSupabase();
    const { data: row, error } = await supabase
      .from("checklist_items")
      .select("id, deal_id, buyer_id, key, role, status")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.deal_id !== id || !row.buyer_id) throw new HttpError(404, "체크리스트 항목을 찾을 수 없어요.");
    const room = await openDealRoom(request, id, row.buyer_id);

    const body = await request.json().catch(() => ({}));
    const status = body.status as ChecklistStatus;
    if (!STATUSES.includes(status)) throw new HttpError(400, "status는 todo, done, confirmed 중 하나여야 해요.");

    const before = await loadRoomChecklist(id, room.buyerId);
    const item = before.find((i) => i.id === itemId)!;
    if (item.auto) throw new HttpError(400, "자료 제출 항목은 자료실에 자료를 올려 공개하면 저절로 체크돼요.");

    const confirm = !!templateFor(item.key)?.confirm;
    if (status === "confirmed") {
      if (!confirm) throw new HttpError(400, "확인 완료는 인수인계 항목에만 쓸 수 있어요.");
      if (room.myRole !== "buyer") throw new HttpError(403, "인수인계 확인은 양수인이 해요.");
      if (item.status === "todo") throw new HttpError(400, "양도인이 먼저 넘긴 뒤에 확인할 수 있어요.");
    } else if (confirm && room.myRole === "buyer") {
      // 양수인은 확인 완료를 되돌리는 것(→ done)만 할 수 있다
      if (status !== "done" || item.status !== "confirmed") throw new HttpError(403, "이 항목은 양도인이 체크해요.");
    } else if (item.role !== room.myRole) {
      throw new HttpError(403, "내 역할의 항목만 체크할 수 있어요.");
    }

    const { error: updateError } = await supabase
      .from("checklist_items")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", itemId);
    if (updateError) throw updateError;

    const after = await loadRoomChecklist(id, room.buyerId);
    const stageAfter = currentStage(after);
    await announceStageChange(id, room.buyerId, currentStage(before), stageAfter);
    return NextResponse.json({ checklist: after, ...stageAfter });
  } catch (e) {
    return handleError(e);
  }
}
