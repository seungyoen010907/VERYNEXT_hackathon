// GET: 거래방 하나 (매물 정보 + 체크리스트 + 지금 단계). id = 매물 id, 양도인은 ?buyer=양수인 id.
// 양수인이 처음 열면 체크리스트를 만들고 에이전트 안내 메시지를 남긴다.

import { NextResponse, type NextRequest } from "next/server";
import { currentStage, ensureChecklist, loadRoomChecklist, openDealRoom, postMessage, userNames } from "@/lib/deals";
import { handleError } from "@/lib/http";
import { toPublicListing } from "@/lib/listings";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]">) {
  try {
    const { id } = await ctx.params;
    const room = await openDealRoom(request, id, request.nextUrl.searchParams.get("buyer"));
    if (!room.isOwner && (await ensureChecklist(id, room.buyerId))) {
      await postMessage(id, room.buyerId, "agent", "거래방이 열렸어요. 양도인과 양수인이 여기서 직접 대화하고 계약 단계를 함께 체크해요.");
    }
    const checklist = await loadRoomChecklist(id, room.buyerId);
    const names = await userNames([room.buyerId]);
    return NextResponse.json({
      listing: room.isOwner ? room.listing : toPublicListing(room.listing),
      is_owner: room.isOwner,
      my_role: room.myRole,
      buyer: { id: room.buyerId, name: names.get(room.buyerId) ?? "양수인" },
      checklist,
      ...currentStage(checklist),
    });
  } catch (e) {
    return handleError(e);
  }
}
