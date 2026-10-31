// GET: 매물 목록 (내 매물은 전체 정보, 남의 공개 매물은 L0만) / POST: 매물 등록 (양도인)

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { parseListingInput, toPublicListing } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import type { Listing } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const { data, error } = await getSupabase()
      .from("deals")
      .select("*")
      .or(`seller_id.eq.${user.id},status.eq.published`)
      .not("seller_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as Listing[];
    return NextResponse.json({
      mine: rows.filter((l) => l.seller_id === user.id),
      published: rows.filter((l) => l.seller_id !== user.id).map(toPublicListing),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user.roles.includes("seller")) throw new HttpError(403, "양도인만 매물을 등록할 수 있어요.");
    const body = await request.json().catch(() => {
      throw new HttpError(400, "요청 형식이 올바르지 않아요.");
    });
    const input = parseListingInput(body);
    const { data, error } = await getSupabase()
      .from("deals")
      .insert({ ...input, seller_id: user.id, status: "draft", stage: "documents" })
      .select("id, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
