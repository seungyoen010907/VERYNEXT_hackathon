// GET: 데이터룸 (권한에 맞게 걸러서) / PATCH: 기본정보 수정·공개 상태 변경 (소유 양도인)

import { NextResponse } from "next/server";
import { accessContext, canSee } from "@/lib/access";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { assertOwner, DOCUMENT_COLUMNS, getListing, parseListingInput, toPublicListing } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import type { DataPoint, DataRoom, ListingDocument } from "@/lib/types";

export async function GET(request: Request, ctx: RouteContext<"/api/listings/[id]">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    const access = accessContext(user, listing);
    if (!access.isOwner && listing.status !== "published") throw new HttpError(404, "매물을 찾을 수 없어요.");

    const supabase = getSupabase();
    const [docs, points, report] = await Promise.all([
      supabase.from("documents").select(DOCUMENT_COLUMNS).eq("deal_id", id).order("created_at"),
      supabase.from("data_points").select("*").eq("listing_id", id).order("period"),
      supabase.from("reports").select("id, created_at, grade, result").eq("deal_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    if (docs.error) throw docs.error;
    if (points.error) throw points.error;
    if (report.error) throw report.error;

    // 권한 없는 자료는 응답에서 뺀다. 원본은 볼 수 없어도 요약 공개면 추출 결과만 보여준다.
    const documents = (docs.data as (ListingDocument & { storage_path?: string; deal_id?: string })[])
      .filter((d) => canSee(access, d.access_level) || canSee(access, d.summary_access_level))
      .map((d) => {
        const rest: ListingDocument & { storage_path?: string; deal_id?: string } = { ...d };
        delete rest.storage_path;
        delete rest.deal_id;
        return canSee(access, d.summary_access_level) ? rest : { ...rest, extraction: null };
      });
    const data_points = (points.data as DataPoint[]).filter((p) => canSee(access, p.access_level));

    const room: DataRoom = {
      is_owner: access.isOwner,
      listing: access.isOwner ? listing : toPublicListing(listing),
      documents,
      data_points,
      // 교차 검증 리포트는 Step 3에서 공개 범위를 정한다. 지금은 양도인 본인만 본다.
      report: access.isOwner ? (report.data[0] ?? null) : null,
    };
    return NextResponse.json(room);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/listings/[id]">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    assertOwner(user, listing);
    const body = await request.json().catch(() => {
      throw new HttpError(400, "요청 형식이 올바르지 않아요.");
    });

    let update: Record<string, unknown>;
    if ("status" in body && Object.keys(body).length === 1) {
      if (body.status !== "draft" && body.status !== "published") throw new HttpError(400, "상태 값이 올바르지 않아요.");
      update = { status: body.status };
    } else {
      update = parseListingInput({ ...listing, ...body });
    }
    const { data, error } = await getSupabase().from("deals").update(update).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ listing: data });
  } catch (e) {
    return handleError(e);
  }
}
