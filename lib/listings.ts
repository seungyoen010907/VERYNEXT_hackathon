import "server-only";

// 매물·데이터룸 서버 로직: 불러오기, L0 변환, 자료 분석 → 추출값(data_points) 저장

import { getUser, type CurrentUser } from "./auth";
import { HttpError } from "./http";
import { extractDocuments } from "./openai";
import { prepareFile } from "./prepare";
import { BUCKET, getSupabase } from "./supabase";
import type { AccessLevel, ExtractedDocument, Listing, ListingDocument, PublicListing } from "./types";

export const DOCUMENT_COLUMNS =
  "id, created_at, updated_at, file_name, kind, size, category, access_level, summary_access_level, extraction, verification_status, storage_path, deal_id";

export async function getListing(id: string): Promise<Listing> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "매물을 찾을 수 없어요.");
  const { data, error } = await getSupabase().from("deals").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "매물을 찾을 수 없어요.");
  return data as Listing;
}

export function assertOwner(user: CurrentUser, listing: Listing) {
  if (listing.seller_id !== user.id) throw new HttpError(403, "이 매물의 양도인만 할 수 있어요.");
}

// 자료를 찾고, 요청한 사람이 그 매물의 양도인인지 확인한다
export async function getOwnedDocument(request: Request, id: string) {
  const user = await getUser(request);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "자료를 찾을 수 없어요.");
  const { data: doc, error } = await getSupabase().from("documents").select(DOCUMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!doc) throw new HttpError(404, "자료를 찾을 수 없어요.");
  const listing = await getListing(doc.deal_id);
  assertOwner(user, listing);
  return { user, doc, listing };
}

// "서울 마포구 ○○로 12, 1층" -> "서울 마포구" (L0에는 대략적인 위치만)
export function roughArea(address: string): string {
  return address.split(/\s+/).slice(0, 2).join(" ");
}

export function toPublicListing(l: Listing): PublicListing {
  return {
    id: l.id,
    created_at: l.created_at,
    area: roughArea(l.address),
    business_type: l.business_type,
    premium: l.premium,
    deposit: l.deposit,
    monthly_rent: l.monthly_rent,
    floor: l.floor,
    area_pyeong: l.area_pyeong,
    themes: l.themes,
    status: l.status,
    is_sample: l.is_sample,
  };
}

// 추출 결과 -> data_points 행 (원본 자료와 연결, 신뢰 수준 "자료 제출")
function toDataPoints(listingId: string, documentId: string, ex: ExtractedDocument, access: AccessLevel) {
  const base = { listing_id: listingId, document_id: documentId, unit: "KRW", trust_level: "submitted", access_level: access };
  const note = `${ex.file_name}에서 추출`;
  const rows = [];
  for (const m of ex.monthly) {
    if (m.gross_sales !== null) rows.push({ ...base, key: `${ex.doc_type}.gross_sales`, period: m.month, value: m.gross_sales, source_note: note });
    if (m.net_amount !== null) rows.push({ ...base, key: `${ex.doc_type}.net_amount`, period: m.month, value: m.net_amount, source_note: note });
  }
  if (ex.stated_total !== null) {
    const period = ex.period_start && ex.period_end ? `${ex.period_start}~${ex.period_end}` : null;
    rows.push({ ...base, key: `${ex.doc_type}.stated_total`, period, value: ex.stated_total, source_note: `${ex.file_name}에 적힌 합계` });
  }
  return rows;
}

// 자료 하나를 AI로 분석해 저장한다. 이미 분석한 자료는 다시 분석하지 않는다 (API 비용 절약).
// AI가 실패해도 자료 자체는 남고 verification_status만 ai_failed가 된다.
export async function analyzeDocument(doc: ListingDocument & { storage_path: string; deal_id: string }) {
  if (doc.extraction) return doc;
  const supabase = getSupabase();

  const { data: file, error: dlError } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (dlError || !file) throw dlError ?? new Error("파일을 내려받지 못했어요.");

  let extracted: ExtractedDocument | undefined;
  try {
    const content = prepareFile(doc.file_name, new Uint8Array(await file.arrayBuffer()));
    const result = await extractDocuments(content);
    extracted = result.documents[0];
  } catch (e) {
    console.error("[analyzeDocument]", e);
  }

  if (!extracted) {
    const { data, error } = await supabase
      .from("documents")
      .update({ verification_status: "ai_failed", updated_at: new Date().toISOString() })
      .eq("id", doc.id)
      .select(DOCUMENT_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  }

  // AI가 읽은 파일명이 달라도 원본 파일명으로 맞춘다
  extracted = { ...extracted, file_name: doc.file_name };
  const rows = toDataPoints(doc.deal_id, doc.id, extracted, doc.summary_access_level);
  await supabase.from("data_points").delete().eq("document_id", doc.id);
  if (rows.length > 0) {
    const { error } = await supabase.from("data_points").insert(rows);
    if (error) throw error;
  }
  const { data, error } = await supabase
    .from("documents")
    .update({ extraction: extracted, verification_status: "analyzed", updated_at: new Date().toISOString() })
    .eq("id", doc.id)
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// ---- 매물 입력 검증 (POST/PATCH /api/listings) ----

const MAX_AMOUNT = 10_000_000_000; // 100억

function amount(v: unknown, label: string, required: boolean): number | null {
  if (v === null || v === undefined || v === "") {
    if (required) throw new HttpError(400, `${label}을(를) 입력해주세요.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) throw new HttpError(400, `${label}은(는) 0~100억 사이의 원 단위 숫자여야 해요.`);
  return n;
}

function smallInt(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < -10 || n > 10_000) throw new HttpError(400, `${label} 값을 확인해주세요.`);
  return n;
}

function text(v: unknown, label: string, max: number, required = false): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new HttpError(400, `${label}을(를) 입력해주세요.`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이하로 입력해주세요.`);
  return s;
}

export const THEMES = ["무권리", "급매", "프랜차이즈", "사무실", "공식 매물", "임대인 매물"];

export function parseListingInput(body: Record<string, unknown>) {
  const businessTypes: string[] = ["음식점", "카페", "서비스업", "도·소매업", "예술·스포츠·시설업", "교육·학원업", "숙박업", "기타"];
  const pb = (body.premium_breakdown ?? {}) as Record<string, unknown>;
  const parking = (body.parking ?? {}) as Record<string, unknown>;
  const themes = Array.isArray(body.themes) ? body.themes.filter((t): t is string => THEMES.includes(t as string)) : [];
  return {
    address: text(body.address, "주소", 200, true),
    building_name: text(body.building_name, "건물명", 100),
    business_name: text(body.business_name, "상호명", 100),
    business_type: businessTypes.includes(body.business_type as string) ? (body.business_type as string) : "기타",
    premium: amount(body.premium, "희망 권리금", true),
    deposit: amount(body.deposit, "보증금", true),
    monthly_rent: amount(body.monthly_rent, "월세", true),
    claimed_monthly_sales: amount(body.claimed_monthly_sales, "양도인 주장 월매출", true),
    claimed_monthly_profit: amount(body.claimed_monthly_profit, "양도인 주장 월 순수익", false),
    premium_breakdown: {
      business: amount(pb.business, "영업권리금", false),
      facility: amount(pb.facility, "시설권리금", false),
      floor: amount(pb.floor, "바닥권리금", false),
      basis: text(pb.basis, "권리금 산정 근거", 1000),
    },
    is_franchise: typeof body.is_franchise === "boolean" ? body.is_franchise : null,
    floor: smallInt(body.floor, "층수"),
    total_floors: smallInt(body.total_floors, "전체 층수"),
    area_pyeong: smallInt(body.area_pyeong, "면적"),
    themes,
    parking: {
      building_total: smallInt(parking.building_total, "건물 전체 주차 대수"),
      for_store: smallInt(parking.for_store, "점포 사용 주차 대수"),
    },
  };
}
