import "server-only";

// 양도인 직접 입력 (PRD F08, docs/API.md 11.1): 월 비용·인력 구성·시설 목록.
// 입력은 파일 없는 데이터룸 항목(documents.kind = 'input')에 data_points로 붙여서,
// 기존 공개 등급·NDA·열람 승인·양수인 AI 답변 흐름을 그대로 탄다.

import { normalizeCost } from "./costs";
import { HttpError } from "./http";
import { getSupabase } from "./supabase";
import type {
  AccessLevel,
  CostGroup,
  CostInput,
  CostKind,
  DataPoint,
  FacilityInput,
  FacilityOwnership,
  InputKey,
  LaborInput,
  ListingInputs,
} from "./types";

const INPUT_DOCS: Record<InputKey, { file_name: string; category: "cost" | "facility" }> = {
  input_cost: { file_name: "양도인 입력 · 월 비용", category: "cost" },
  input_facility: { file_name: "양도인 입력 · 시설 목록", category: "facility" },
};

const MAX_LINES = 40;
const MAX_AMOUNT = 10_000_000_000;

export async function ensureInputDocument(listingId: string, key: InputKey, level: AccessLevel = "L1") {
  const supabase = getSupabase();
  const { data: found, error } = await supabase
    .from("documents")
    .select("id, summary_access_level")
    .eq("deal_id", listingId)
    .eq("kind", "input")
    .eq("checklist_key", key)
    .maybeSingle();
  if (error) throw error;
  if (found) return found as { id: string; summary_access_level: AccessLevel };
  const { data, error: insertError } = await supabase
    .from("documents")
    .insert({
      deal_id: listingId,
      checklist_key: key,
      category: INPUT_DOCS[key].category,
      file_name: INPUT_DOCS[key].file_name,
      storage_path: `virtual:${key}`,
      kind: "input",
      size: 0,
      access_level: level,
      summary_access_level: level,
      verification_status: "analyzed",
    })
    .select("id, summary_access_level")
    .single();
  if (insertError) throw insertError;
  return data as { id: string; summary_access_level: AccessLevel };
}

// data_points 행 → 입력값 (양도인 화면, 계산 공용)
export function inputsFromPoints(points: DataPoint[]): Omit<ListingInputs, "levels"> {
  const costs: CostInput[] = points
    .filter((p) => p.key === "input.cost" && p.value !== null)
    .map((p) => {
      const m = (p.meta ?? {}) as Partial<CostInput>;
      return {
        name: p.source_note ?? "비용",
        amount: Number(p.value),
        group: (m.group ?? "other") as CostGroup,
        kind: (m.kind ?? "unknown") as CostKind,
        kind_source: m.kind_source === "user" ? "user" : "auto",
      };
    });
  const laborPoint = points.find((p) => p.key === "input.labor");
  const labor = laborPoint ? ({ family: 0, staff: 0, ...(laborPoint.meta ?? {}) } as LaborInput) : null;
  const facilities: FacilityInput[] = points
    .filter((p) => p.key === "input.facility")
    .map((p) => ({ ...(p.meta as Omit<FacilityInput, "name" | "claimed_value">), name: p.source_note ?? "시설", claimed_value: p.value === null ? null : Number(p.value) }));
  return { costs, labor, facilities };
}

export async function loadInputs(listingId: string): Promise<ListingInputs> {
  const supabase = getSupabase();
  const [docs, points] = await Promise.all([
    supabase.from("documents").select("id, checklist_key, summary_access_level").eq("deal_id", listingId).eq("kind", "input"),
    supabase.from("data_points").select("*").eq("listing_id", listingId).like("key", "input.%").order("created_at"),
  ]);
  if (docs.error) throw docs.error;
  if (points.error) throw points.error;
  const levels: ListingInputs["levels"] = {};
  for (const d of docs.data ?? []) levels[d.checklist_key as InputKey] = { document_id: d.id, level: d.summary_access_level };
  return { ...inputsFromPoints((points.data ?? []) as DataPoint[]), levels };
}

// ---- 입력 검증 ----

function amount(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) throw new HttpError(400, `${label}은(는) 0~100억 사이의 원 단위 숫자여야 해요.`);
  return n;
}
function optAmount(v: unknown, label: string): number | null {
  return v === null || v === undefined || v === "" ? null : amount(v, label);
}
function count(v: unknown, label: string, max = 100): number {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, `${label}은(는) 0~${max} 사이 정수여야 해요.`);
  return n;
}
function str(v: unknown, label: string, max: number, required = false): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new HttpError(400, `${label}을(를) 입력해주세요.`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `${label}은(는) ${max}자 이하로 입력해주세요.`);
  return s;
}
function list(v: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new HttpError(400, `${label}은(는) 목록이어야 해요.`);
  if (v.length > MAX_LINES) throw new HttpError(400, `${label}은(는) ${MAX_LINES}줄까지 넣을 수 있어요.`);
  return v as Record<string, unknown>[];
}

const GROUPS: CostGroup[] = ["ingredients", "labor", "utilities", "other"];
const KINDS: CostKind[] = ["variable", "fixed", "unknown"];
const OWNERSHIP: FacilityOwnership[] = ["owned", "rental", "lease"];

export function parseCosts(v: unknown): CostInput[] {
  return list(v, "월 비용")
    .map((c, i): CostInput => {
      const label = `비용 ${i + 1}번째 줄`;
      const kindSource = c.kind_source === "user" ? "user" : "auto";
      if (kindSource === "user" && !KINDS.includes(c.kind as CostKind)) throw new HttpError(400, `${label}의 분류가 올바르지 않아요.`);
      return normalizeCost({
        name: str(c.name, `${label} 이름`, 60, true)!,
        amount: amount(c.amount, `${label} 금액`),
        group: GROUPS.includes(c.group as CostGroup) ? (c.group as CostGroup) : "other",
        kind: (c.kind as CostKind) ?? "unknown",
        kind_source: kindSource,
      });
    })
    .filter((c) => c.amount > 0);
}

export function parseLabor(v: unknown): LaborInput | null {
  if (v === null || v === undefined) return null;
  const o = v as Record<string, unknown>;
  return { family: count(o.family, "가족·동업자 수", 20), staff: count(o.staff, "고용 직원 수", 100) };
}

export function parseFacilities(v: unknown): FacilityInput[] {
  const thisYear = new Date().getFullYear();
  return list(v, "시설 목록").map((f, i): FacilityInput => {
    const label = `시설 ${i + 1}번째 줄`;
    const year = f.purchase_year === null || f.purchase_year === undefined || f.purchase_year === "" ? null : Number(f.purchase_year);
    if (year !== null && (!Number.isInteger(year) || year < 1980 || year > thisYear)) throw new HttpError(400, `${label}의 구매 연도를 확인해주세요.`);
    const qty = count(f.qty ?? 1, `${label} 수량`, 100);
    return {
      name: str(f.name, `${label} 시설명`, 60, true)!,
      brand_model: str(f.brand_model, `${label} 브랜드·모델`, 80),
      qty: Math.max(1, qty),
      purchase_year: year,
      purchase_price: optAmount(f.purchase_price, `${label} 구매가`),
      condition: str(f.condition, `${label} 상태`, 40),
      ownership: OWNERSHIP.includes(f.ownership as FacilityOwnership) ? (f.ownership as FacilityOwnership) : "owned",
      is_interior: f.is_interior === true,
      has_receipt: f.has_receipt === true,
      claimed_value: optAmount(f.claimed_value, `${label} 반영 가격`),
    };
  });
}

// 같은 시설인지 (AI 추정을 다시 할지) 판단하는 키: 추정에 넣는 값만
export function facilityEstimateKey(f: FacilityInput): string {
  return JSON.stringify([f.name, f.brand_model, f.purchase_year, f.purchase_price, f.condition]);
}

// 한 묶음(비용 또는 시설)의 행을 통째로 바꾼다. 기존 입력 항목의 공개 등급을 따른다.
async function replaceRows(listingId: string, key: InputKey, keys: string[], rows: Record<string, unknown>[]) {
  const supabase = getSupabase();
  const doc = await ensureInputDocument(listingId, key);
  const { error: delError } = await supabase.from("data_points").delete().eq("listing_id", listingId).in("key", keys);
  if (delError) throw delError;
  if (rows.length === 0) return;
  const base = { listing_id: listingId, document_id: doc.id, trust_level: "owner_stated", access_level: doc.summary_access_level };
  const { error } = await supabase.from("data_points").insert(rows.map((r) => ({ ...base, unit: "KRW", period: null, ...r })));
  if (error) throw error;
}

export async function saveCosts(listingId: string, costs: CostInput[], labor: LaborInput | null) {
  const rows: Record<string, unknown>[] = costs.map((c) => ({
    key: "input.cost",
    value: c.amount,
    source_note: c.name,
    meta: { group: c.group, kind: c.kind, kind_source: c.kind_source },
  }));
  if (labor) rows.push({ key: "input.labor", value: null, unit: "person", source_note: "인력 구성", meta: labor });
  await replaceRows(listingId, "input_cost", ["input.cost", "input.labor"], rows);
}

export async function saveFacilities(listingId: string, facilities: (FacilityInput & { estimate_key?: string })[]) {
  const rows = facilities.map((f) => {
    const { name, claimed_value, ...meta } = f;
    return { key: "input.facility", value: claimed_value, unit: "KRW", source_note: name, meta };
  });
  await replaceRows(listingId, "input_facility", ["input.facility"], rows);
}
