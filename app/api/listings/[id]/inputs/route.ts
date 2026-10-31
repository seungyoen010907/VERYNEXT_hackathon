// GET: 양도인 입력값 (월 비용·인력·시설 목록) / PUT: 보낸 묶음만 통째로 바꾼다 (소유 양도인, docs/API.md 11.2)
// 시설은 내용이 바뀐 줄만 AI로 중고 가치를 추정한다. AI가 실패해도 저장은 되고 그 줄은 "시세 미확인".

import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { handleError } from "@/lib/http";
import { facilityEstimateKey, loadInputs, parseCosts, parseFacilities, parseLabor, saveCosts, saveFacilities } from "@/lib/inputs";
import { assertOwner, getListing } from "@/lib/listings";
import { estimateFacilities } from "@/lib/openai";
import type { FacilityInput } from "@/lib/types";

export const maxDuration = 60; // 시설 AI 추정

export async function GET(request: Request, ctx: RouteContext<"/api/listings/[id]/inputs">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    assertOwner(user, listing);
    return NextResponse.json(await loadInputs(id));
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/listings/[id]/inputs">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    assertOwner(user, listing);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const changed: string[] = [];
    let aiFailed = false;

    if ("costs" in body || "labor" in body) {
      const before = await loadInputs(id);
      const costs = "costs" in body ? parseCosts(body.costs) : before.costs;
      const labor = "labor" in body ? parseLabor(body.labor) : before.labor;
      await saveCosts(id, costs, labor);
      changed.push(`월 비용 ${costs.length}줄`);
    }

    if ("facilities" in body) {
      const facilities = parseFacilities(body.facilities);
      const before = await loadInputs(id);
      // 같은 시설(추정에 넣는 값이 같음)이고 지난번에 추정이 끝났으면 재사용한다
      const previous = new Map(before.facilities.filter((f) => f.estimate_key).map((f) => [f.estimate_key!, f.estimate ?? null]));
      const final: FacilityInput[] = facilities.map((f) => {
        const key = facilityEstimateKey(f);
        return previous.has(key) ? { ...f, estimate: previous.get(key), estimate_key: key } : { ...f, estimate: null, estimate_key: "" };
      });
      // 인테리어는 처분가를 보지 않는다 (PRD F08)
      const todo = final.map((f, i) => ({ f, i })).filter(({ f }) => !f.estimate_key && !f.is_interior);
      if (todo.length > 0) {
        try {
          const results = await estimateFacilities(todo.map(({ f }) => ({ name: f.name, brand_model: f.brand_model, purchase_year: f.purchase_year, purchase_price: f.purchase_price, condition: f.condition })));
          for (const r of results) {
            const target = todo[r.index];
            if (!target) continue;
            final[target.i].estimate = { low: r.low, high: r.high, basis: r.basis };
            final[target.i].estimate_key = facilityEstimateKey(final[target.i]);
          }
        } catch {
          aiFailed = true; // estimate_key가 빈 줄은 다음 저장 때 다시 추정한다
        }
      }
      await saveFacilities(id, final);
      changed.push(`시설 ${final.length}줄`);
    }

    if (changed.length) await audit(user.id, "access_change", id, `양도인 입력 저장: ${changed.join(", ")}`);
    return NextResponse.json({ ...(await loadInputs(id)), ai_failed: aiFailed });
  } catch (e) {
    return handleError(e);
  }
}
