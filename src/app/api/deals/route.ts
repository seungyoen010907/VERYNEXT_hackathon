import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { listDeals, startDeal, startDealSchema, type DealFilter } from "@/server/deals/repo";

const FILTERS: DealFilter[] = ["all", "buying", "selling", "active", "closed"];

export async function GET(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    const f = request.nextUrl.searchParams.get("filter") as DealFilter | null;
    return ok(await listDeals(db, viewer, f && FILTERS.includes(f) ? f : "all"));
  });
}

/** 거래 문의 시작. 같은 매물에 이미 거래가 있으면 그 거래를 돌려준다 (200). */
export async function POST(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    const input = await readJson(request, startDealSchema);
    const { deal, created } = await startDeal(db, viewer, input);
    return ok({ deal, created }, created ? 201 : 200);
  });
}
