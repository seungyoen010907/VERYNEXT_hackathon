import "server-only";

// 한 사용자가 한 매물에서 "지금 볼 수 있는 것"만 모은다. 데이터룸·추천·비교·에이전트 답변이 모두 이 함수를 쓴다.
// 권한 없는 자료는 여기서 빠지므로, 이 결과만 AI에 넘기면 AI가 비공개 자료를 볼 수 없다.

import { canSee, loadAccess, type AccessContext } from "./access";
import type { CurrentUser } from "./auth";
import { computeFacts, type BuyerProfile, type ListingBasics, type ListingFacts } from "./facts";
import { DOCUMENT_COLUMNS, isVirtual, roughArea } from "./listings";
import { getSupabase } from "./supabase";
import type { DataPoint, Grade, Listing, ListingDocument, Report } from "./types";

export type DocRow = ListingDocument & { storage_path?: string; deal_id?: string };

export type VisibleData = {
  access: AccessContext;
  files: DocRow[]; // 파일 자료 전체 (권한 판단용, 응답에 그대로 내보내지 않는다)
  reportDoc: DocRow | undefined;
  inputDocs: DocRow[]; // 양도인 직접 입력 항목 (월 비용, 시설 목록). 파일 없음
  documents: ListingDocument[]; // 볼 수 있는 자료 (원본 또는 요약 권한)
  data_points: DataPoint[];
  report: { id: string; created_at: string; grade: Grade; result: Report } | null;
};

export async function loadVisibleData(user: CurrentUser, listing: Listing): Promise<VisibleData> {
  const access = await loadAccess(user, listing);
  const supabase = getSupabase();
  const [docs, points, report] = await Promise.all([
    supabase.from("documents").select(DOCUMENT_COLUMNS).eq("deal_id", listing.id).order("created_at"),
    supabase.from("data_points").select("*").eq("listing_id", listing.id).order("period"),
    supabase.from("reports").select("id, created_at, grade, result").eq("deal_id", listing.id).order("created_at", { ascending: false }).limit(1),
  ]);
  for (const r of [docs, points, report]) if (r.error) throw r.error;

  const all = docs.data as DocRow[];
  const reportDoc = all.find((d) => d.kind === "report");
  const inputDocs = all.filter((d) => d.kind === "input");
  const files = all.filter((d) => !isVirtual(d.kind));
  const raw = (d: DocRow) => canSee(access, d.access_level, { type: "document", id: d.id });
  const summary = (d: DocRow) => canSee(access, d.summary_access_level, { type: "document_summary", id: d.id });

  const documents = files
    .filter((d) => raw(d) || summary(d))
    .map((d) => {
      const rest: DocRow = { ...d };
      delete rest.storage_path;
      delete rest.deal_id;
      return summary(d) ? rest : { ...rest, extraction: null };
    });
  // 추출값은 그 값이 나온 항목(파일 자료 또는 양도인 입력)의 "요약" 승인으로 열린다
  const docById = new Map([...files, ...inputDocs].map((d) => [d.id, d]));
  const data_points = (points.data as DataPoint[]).filter((p) => {
    const doc = p.document_id ? docById.get(p.document_id) : undefined;
    return canSee(access, p.access_level, { type: "document_summary", id: doc?.id ?? null });
  });
  const showReport = !!reportDoc && summary(reportDoc);

  return { access, files, reportDoc, inputDocs, documents, data_points, report: showReport ? (report.data?.[0] ?? null) : null };
}

// showClaims: 양도인 주장(현금매출)은 검증 리포트를 볼 수 있을 때만 넣는다 (주장 월매출과 같은 공개 범위)
export function listingBasics(listing: Listing, isOwner: boolean, showClaims = false): ListingBasics {
  return {
    id: listing.id,
    name: isOwner ? (listing.business_name ?? listing.address) : `${roughArea(listing.address)} ${listing.business_type}`,
    area: roughArea(listing.address),
    business_type: listing.business_type,
    premium: listing.premium,
    deposit: listing.deposit,
    monthly_rent: listing.monthly_rent,
    is_sample: listing.is_sample,
    premium_breakdown: listing.premium_breakdown,
    maintenance_fee: listing.maintenance_fee,
    lease_remaining_months: listing.lease_remaining_months,
    claimed_monthly_cash_sales: isOwner || showClaims ? listing.claimed_monthly_cash_sales : null,
  };
}

export async function visibleFacts(user: CurrentUser, listing: Listing): Promise<{ facts: ListingFacts; visible: VisibleData }> {
  const visible = await loadVisibleData(user, listing);
  const basics = listingBasics(listing, visible.access.isOwner, !!visible.report);
  return { facts: computeFacts(basics, visible.data_points, visible.report?.result ?? null), visible };
}

export async function getBuyerProfile(userId: string): Promise<BuyerProfile | null> {
  const { data, error } = await getSupabase().from("buyer_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as BuyerProfile | null;
}
