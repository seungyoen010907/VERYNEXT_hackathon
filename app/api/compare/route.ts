// GET /api/compare?ids=a,b,c — 매물 최대 3개 비교표 (객관 비교 + 내 조건 맞춤). 양수인이 볼 수 있는 자료만 쓴다.

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { buildComparison } from "@/lib/compare";
import { handleError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim());
    return NextResponse.json(await buildComparison(user, ids));
  } catch (e) {
    return handleError(e);
  }
}
