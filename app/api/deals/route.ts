// GET: 내 거래방 목록. 양수인은 내가 연 거래방, 양도인은 내 매물에 열린 양수인별 거래방.

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { currentStage, loadChecklists, todoCount, userNames } from "@/lib/deals";
import { handleError } from "@/lib/http";
import { roughArea } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import type { DealListItem, Listing } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const supabase = getSupabase();

    const { data: mine, error } = await supabase.from("deals").select("id").eq("seller_id", user.id);
    if (error) throw error;
    const myListingIds = (mine ?? []).map((l) => l.id);

    const [asSeller, asBuyer] = await Promise.all([
      myListingIds.length ? loadChecklists({ listingIds: myListingIds }) : Promise.resolve(new Map()),
      user.roles.includes("buyer") ? loadChecklists({ buyerId: user.id }) : Promise.resolve(new Map()),
    ]);
    const rooms = [...asSeller.values(), ...asBuyer.values()];

    const listingIds = [...new Set(rooms.map((r) => r.listingId))];
    const { data: listings, error: listingError } = listingIds.length
      ? await supabase.from("deals").select("*").in("id", listingIds)
      : { data: [], error: null };
    if (listingError) throw listingError;
    const byId = new Map((listings as Listing[]).map((l) => [l.id, l]));
    const names = await userNames([...new Set(rooms.map((r) => r.buyerId))]);

    const items: DealListItem[] = [];
    for (const r of rooms) {
      const l = byId.get(r.listingId);
      if (!l) continue;
      const owner = l.seller_id === user.id;
      // 양수인에게는 L0 정보(대략적인 위치)만, 비공개로 돌린 매물은 목록에서 뺀다
      if (!owner && l.status !== "published") continue;
      const { stage, completed } = currentStage(r.items);
      items.push({
        listing_id: l.id,
        buyer_id: r.buyerId,
        buyer_name: names.get(r.buyerId) ?? "양수인",
        title: owner ? (l.business_name ?? l.address) : `${roughArea(l.address)} ${l.business_type}`,
        business_type: l.business_type,
        is_sample: l.is_sample,
        created_at: r.openedAt,
        stage,
        completed,
        todo_count: todoCount(r.items, owner ? "seller" : "buyer"),
      });
    }
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({ deals: items });
  } catch (e) {
    return handleError(e);
  }
}
