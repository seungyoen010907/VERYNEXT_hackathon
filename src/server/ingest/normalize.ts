/**
 * AI 문서 분석 결과(JSON) 정규화
 *
 * 다른 팀원의 문서 분석 모듈이 보내는 JSON(추출 스키마 v1, docs/ai-integration.md)을
 * 공통 형식(NormalizedPayload)으로 바꾼다.
 *  - 원본은 수정하지 않는다. 호출 측이 extracted_data에 그대로 저장한다.
 *  - 해석할 수 없는 항목은 버리고 warnings에 이유를 남긴다. 값을 추측해 채우지 않는다.
 */
import {
  AGGREGATION_BASES,
  DOCUMENT_TYPES,
  EXPENSE_CATEGORIES,
  REVENUE_SOURCES,
  type AggregationBasis,
  type DocumentType,
  type ExpenseCategory,
  type NormalizedPayload,
  type RevenueSource,
  type YearMonth,
} from "@/types/domain";

export const EXTRACTION_SCHEMA_VERSION = "1.0";

export interface NormalizeResult {
  payload: NormalizedPayload;
  warnings: string[];
  provider: string;
  providerVersion: string | null;
  schemaVersion: string;
}

export class ExtractionFormatError extends Error {}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 30000000, "30,000,000", "30,000,000원" → 30000000. 해석 불가 → null */
export function parseWon(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s원₩]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

/** "2026-04", "2026-04-15", "2026.04", "202604", "2026년 4월" → "2026-04-01" */
export function parseYearMonth(v: unknown): YearMonth | null {
  if (typeof v !== "string") return null;
  const m =
    v.match(/^(\d{4})[-./]?(\d{1,2})(?:[-./]\d{1,2})?$/) ?? v.match(/^(\d{4})년\s*(\d{1,2})월$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}-01`;
}

function parseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function optBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function normalizeExtraction(raw: unknown, fallbackType?: DocumentType): NormalizeResult {
  if (!isObj(raw)) throw new ExtractionFormatError("분석 결과는 JSON 객체여야 합니다.");
  const warnings: string[] = [];

  const schemaVersion = str(raw.schema_version) ?? EXTRACTION_SCHEMA_VERSION;
  if (!schemaVersion.startsWith("1.")) {
    throw new ExtractionFormatError(`지원하지 않는 schema_version: ${schemaVersion} (지원: 1.x)`);
  }

  const rawType = str(raw.document_type);
  let documentType: DocumentType;
  if (rawType && (DOCUMENT_TYPES as readonly string[]).includes(rawType)) {
    documentType = rawType as DocumentType;
  } else if (fallbackType) {
    if (rawType) warnings.push(`알 수 없는 document_type "${rawType}": 업로드 시 선택한 종류(${fallbackType}) 사용`);
    documentType = fallbackType;
  } else {
    throw new ExtractionFormatError("document_type이 없거나 올바르지 않습니다.");
  }

  const revenues: NormalizedPayload["revenues"] = [];
  const rawRevenues = Array.isArray(raw.revenues) ? raw.revenues : [];
  if (raw.revenues !== undefined && !Array.isArray(raw.revenues)) warnings.push("revenues가 배열이 아니어서 무시함");
  rawRevenues.forEach((r, i) => {
    if (!isObj(r)) return warnings.push(`revenues[${i}]: 객체가 아님`);
    const source = str(r.source);
    if (!source || !(REVENUE_SOURCES as readonly string[]).includes(source) || source === "claimed") {
      return warnings.push(`revenues[${i}]: 알 수 없는 source "${String(r.source)}"`);
    }
    const yearMonth = parseYearMonth(r.year_month);
    if (!yearMonth) return warnings.push(`revenues[${i}]: year_month 해석 불가 "${String(r.year_month)}"`);
    const amount = parseWon(r.amount);
    if (amount === null || amount < 0) return warnings.push(`revenues[${i}]: amount 해석 불가 "${String(r.amount)}"`);
    const basisRaw = str(r.aggregation_basis) ?? "unknown";
    const aggregationBasis = (AGGREGATION_BASES as readonly string[]).includes(basisRaw)
      ? (basisRaw as AggregationBasis)
      : "unknown";
    if (basisRaw !== aggregationBasis) warnings.push(`revenues[${i}]: 알 수 없는 aggregation_basis "${basisRaw}" → unknown`);
    const orderCount = parseWon(r.order_count);
    revenues.push({
      source: source as RevenueSource,
      platform: str(r.platform),
      yearMonth,
      amount,
      aggregationBasis,
      vatIncluded: optBool(r.vat_included),
      includesCard: source === "pos" ? optBool(r.includes_card) : null,
      includesDelivery: source === "pos" ? optBool(r.includes_delivery) : null,
      orderCount: orderCount !== null && orderCount >= 0 ? orderCount : null,
    });
  });

  const expenses: NormalizedPayload["expenses"] = [];
  const rawExpenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  rawExpenses.forEach((e, i) => {
    if (!isObj(e)) return warnings.push(`expenses[${i}]: 객체가 아님`);
    const category = str(e.category);
    if (!category || !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      return warnings.push(`expenses[${i}]: 알 수 없는 category "${String(e.category)}"`);
    }
    const yearMonth = parseYearMonth(e.year_month);
    if (!yearMonth) return warnings.push(`expenses[${i}]: year_month 해석 불가 "${String(e.year_month)}"`);
    const amount = parseWon(e.amount);
    if (amount === null || amount < 0) return warnings.push(`expenses[${i}]: amount 해석 불가 "${String(e.amount)}"`);
    expenses.push({
      category: category as ExpenseCategory,
      yearMonth,
      amount,
      // AI가 증빙 문서에서 추출한 값이다. 증빙 여부를 명시적으로 false로 보낸 경우만 미확인으로 본다.
      isVerified: e.verified !== false,
      note: str(e.note),
    });
  });

  const notes: NormalizedPayload["notes"] = [];
  if (isObj(raw.contract)) {
    const c = raw.contract;
    for (const key of ["deposit", "monthly_rent", "maintenance_fee"] as const) {
      if (c[key] === undefined || c[key] === null) continue;
      const v = parseWon(c[key]);
      if (v === null) warnings.push(`contract.${key} 해석 불가`);
      else notes.push({ key, value: String(v) });
    }
    for (const key of ["contract_start_date", "contract_end_date"] as const) {
      if (c[key] === undefined || c[key] === null) continue;
      const v = parseDate(c[key]);
      if (v === null) warnings.push(`contract.${key} 날짜 해석 불가`);
      else notes.push({ key, value: v });
    }
    const terms = Array.isArray(c.special_terms) ? c.special_terms : c.special_terms ? [c.special_terms] : [];
    for (const t of terms) if (str(t)) notes.push({ key: "special_terms", value: str(t)! });
  }

  if (Array.isArray(raw.review_flags)) {
    for (const f of raw.review_flags) {
      if (isObj(f) && str(f.message)) warnings.push(`[문서 리뷰] ${str(f.message)}`);
    }
  }

  const months = [...revenues.map((r) => r.yearMonth), ...expenses.map((e) => e.yearMonth)].sort();
  const period = isObj(raw.period) ? raw.period : {};
  return {
    payload: {
      documentType,
      periodStart: parseYearMonth(period.start) ?? months[0] ?? null,
      periodEnd: parseYearMonth(period.end) ?? months[months.length - 1] ?? null,
      revenues,
      expenses,
      notes,
    },
    warnings,
    provider: str(raw.provider) ?? "unknown",
    providerVersion: str(raw.provider_version),
    schemaVersion,
  };
}
