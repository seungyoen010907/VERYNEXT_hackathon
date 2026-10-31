// GET: 데이터룸 (권한에 맞게 걸러서) / PATCH: 기본정보 수정·공개 상태 변경 (소유 양도인)

import { NextResponse } from "next/server";
import { canSee } from "@/lib/access";
import { audit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { CATEGORY_LABEL, DOC_TYPE_LABEL } from "@/lib/labels";
import { assertOwner, getListing, parseListingInput, toPublicListing } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import type { DataRoom, GrantStatus, LockedItem, NdaStatus } from "@/lib/types";
import { loadVisibleData, type DocRow } from "@/lib/visible";

export async function GET(request: Request, ctx: RouteContext<"/api/listings/[id]">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    const { access, files, reportDoc, documents, data_points, report } = await loadVisibleData(user, listing);
    if (!access.isOwner && listing.status !== "published") throw new HttpError(404, "매물을 찾을 수 없어요.");

    const supabase = getSupabase();
    const [nda, grants] = await Promise.all([
      supabase.from("ndas").select("status, version, agreed_at, revoked_at").eq("listing_id", id).eq("buyer_id", user.id).maybeSingle(),
      access.isOwner
        ? supabase.from("access_grants").select("id", { count: "exact", head: true }).eq("listing_id", id).eq("status", "requested")
        : supabase.from("access_grants").select("target_type, target_id, status").eq("listing_id", id).eq("buyer_id", user.id),
    ]);
    for (const r of [nda, grants]) if (r.error) throw r.error;
    const raw = (d: DocRow) => canSee(access, d.access_level, { type: "document", id: d.id });
    const summary = (d: DocRow) => canSee(access, d.summary_access_level, { type: "document_summary", id: d.id });

    // 양수인에게 잠긴 항목 목록 (L1·L2만. L3는 알리지 않는다)
    const locked: LockedItem[] = [];
    if (!access.isOwner) {
      const requestStatus = new Map(
        ((grants.data ?? []) as { target_type: string; target_id: string; status: GrantStatus }[]).map((g) => [`${g.target_type}:${g.target_id}`, g.status]),
      );
      const items = reportDoc ? [...files, reportDoc] : files;
      for (const d of items) {
        const label = d.kind === "report" ? "AI 교차 검증 리포트" : `${CATEGORY_LABEL[d.category]} · ${d.extraction ? DOC_TYPE_LABEL[d.extraction.doc_type] : "자료"}`;
        if ((d.summary_access_level === "L1" || d.summary_access_level === "L2") && !summary(d)) {
          locked.push({ target_type: "document_summary", target_id: d.id, label: `${label} 요약`, category: d.category, level: d.summary_access_level, request_status: requestStatus.get(`document_summary:${d.id}`) ?? null });
        }
        if (d.kind !== "report" && (d.access_level === "L1" || d.access_level === "L2") && !raw(d)) {
          locked.push({ target_type: "document", target_id: d.id, label: `${label} 원본`, category: d.category, level: d.access_level, request_status: requestStatus.get(`document:${d.id}`) ?? null });
        }
      }
      await audit(user.id, "view_dataroom", id, `공개 자료 ${documents.length}개, 숫자 ${data_points.length}개 열람`);
    }

    const room: DataRoom = {
      is_owner: access.isOwner,
      listing: access.isOwner ? listing : toPublicListing(listing),
      documents,
      data_points,
      report,
      report_access: access.isOwner && reportDoc ? { document_id: reportDoc.id, level: reportDoc.summary_access_level } : null,
      nda: access.isOwner ? null : ((nda.data as NdaStatus | null) ?? null),
      locked,
      pending_requests: access.isOwner ? (grants.count ?? 0) : 0,
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
