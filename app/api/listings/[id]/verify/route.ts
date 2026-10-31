// POST: 저장된 추출 결과로 교차 검증 리포트를 만든다 (소유 양도인).
// 파일을 다시 AI에 보내지 않는다. 검증은 lib/verify.ts(코드), 요약만 AI. 요약이 실패해도 리포트는 저장한다.

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { assertOwner, ensureReportDocument, getListing, VIRTUAL_KINDS_FILTER } from "@/lib/listings";
import { summarizeReport } from "@/lib/openai";
import { getSupabase } from "@/lib/supabase";
import type { ExtractedDocument, Report, Summary } from "@/lib/types";
import { verify } from "@/lib/verify";

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/verify">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    const listing = await getListing(id);
    assertOwner(user, listing);

    const supabase = getSupabase();
    const { data: docs, error } = await supabase.from("documents").select("extraction").eq("deal_id", id).not("kind", "in", VIRTUAL_KINDS_FILTER).not("extraction", "is", null);
    if (error) throw error;
    const documents = (docs ?? []).map((d) => d.extraction as ExtractedDocument);
    if (documents.length === 0) throw new HttpError(400, "분석이 끝난 자료가 없어요. 매출 자료를 먼저 올려주세요.");

    const extraction = { documents };
    const result = verify(extraction, listing.claimed_monthly_sales);

    let summary: Summary | null = null;
    try {
      summary = await summarizeReport({
        deal: {
          premium: listing.premium,
          deposit: listing.deposit,
          monthly_rent: listing.monthly_rent,
          claimed_monthly_sales: listing.claimed_monthly_sales,
          claimed_monthly_profit: listing.claimed_monthly_profit,
        },
        result,
      });
    } catch {
      summary = null;
    }

    const report: Report = { extraction, ...result, summary };
    const { data, error: insertError } = await supabase
      .from("reports")
      .insert({ deal_id: id, grade: report.grade, result: report })
      .select("id, created_at, grade, result")
      .single();
    if (insertError) throw insertError;
    await ensureReportDocument(id);
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
