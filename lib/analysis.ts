// F08 매출 증빙·수익성·권리금 회수 분석 (PRD F08, docs/API.md 11.3). 전부 코드 계산이고 서버·브라우저 공용이다.
// 양수인 화면의 조정(권리금·매출 변화율·직접 운영 등)은 브라우저에서 computeAnalysis를 다시 불러 바로 갱신한다.
// 이 결과는 매출의 진실성이나 권리금 적정가를 보증하지 않는다. 낸 자료 기준의 실사 보조 계산이다.

import { won } from "./format";
import type { CostKind, FacilityInput, Report } from "./types";

export const MIN_WAGE = 10_320; // 2026년 최저시급 (원), facts.ts MIN_WAGE_2026과 같은 값
export const WEEKS_PER_MONTH = 4.345;
const CROSS_TOLERANCE = 0.1;
const SPIKE_RATE = 0.3; // 직전 3개월 평균보다 30% 넘게 늘면 급증

// ---- 비용 줄 ----

export type CostLine = {
  name: string;
  amount: number;
  kind: CostKind; // unknown은 고정비로 가정
  source: "input" | "document" | "listing";
  note: string;
};

// ---- 1. 매출 증빙 ----

export type EvidenceLevel = "high" | "medium" | "low";
export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = { high: "높음", medium: "보통", low: "낮음" };

export type SalesEvidence = {
  claimed: number | null; // 양도인 주장 월매출 (검증 리포트를 볼 수 있을 때만)
  verified: number | null; // 교차 확인된 월매출
  unverified: number | null;
  rate: number | null; // 증빙률 (0~1+)
  level: EvidenceLevel | null;
  verified_months: string[];
  excluded: { month: string; reason: string }[];
  basis: string;
  warnings: string[];
};

function monthRange(start: string, end: string): string[] {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (out.length > 120) break;
  }
  return out;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export function salesEvidence(report: Report | null, claimedCash: number | null, hasCashEvidence: boolean): SalesEvidence {
  const empty: SalesEvidence = {
    claimed: null,
    verified: null,
    unverified: null,
    rate: null,
    level: null,
    verified_months: [],
    excluded: [],
    basis: "검증 리포트를 볼 수 없어요",
    warnings: [],
  };
  if (!report) return empty;

  const vatDoc = report.extraction.documents.find((d) => d.doc_type === "vat_return" && d.period_start && d.period_end);
  const vatMonths = new Set(vatDoc ? monthRange(vatDoc.period_start!, vatDoc.period_end!) : []);
  const vatOk = report.checks.some((c) => c.kind === "vat" && c.level === "ok");

  const verifiedMonths: string[] = [];
  const excluded: SalesEvidence["excluded"] = [];
  const values: number[] = [];
  for (const row of report.monthly) {
    if (row.card === null || row.card_plus_delivery === null) continue; // 카드 승인 매출이 기준 (정산 입금액은 비교하지 않는다)
    // 자료끼리 어긋난 달은 다른 자료가 맞아도 교차 확인에서 뺀다
    if (row.pos !== null && row.pos_diff_rate !== null && Math.abs(row.pos_diff_rate) >= CROSS_TOLERANCE) {
      excluded.push({ month: row.month, reason: `POS ${won(row.pos)} vs 카드+배달 ${won(row.card_plus_delivery)} (${pct(Math.abs(row.pos_diff_rate))} 차이)` });
      continue;
    }
    const posOk = row.pos !== null;
    const vatCovers = vatOk && vatMonths.has(row.month);
    if (posOk || vatCovers) {
      verifiedMonths.push(row.month);
      values.push(row.card_plus_delivery);
    } else {
      excluded.push({ month: row.month, reason: "카드·배달 자료 하나뿐이라 다른 자료로 확인하지 못했어요" });
    }
  }

  const claimed = report.claimed_vs_actual.claimed_monthly_sales || null;
  const verified = values.length ? Math.round(avg(values)) : null;
  const rate = verified !== null && claimed ? verified / claimed : null;
  const level: EvidenceLevel | null = rate === null ? null : rate >= 0.9 ? "high" : rate >= 0.7 ? "medium" : "low";

  const warnings: string[] = [];
  if (claimedCash && claimedCash > 0 && !hasCashEvidence) warnings.push(`현금매출 월 ${won(claimedCash)} 근거 미제출 (현금영수증·계좌 자료 없음)`);
  for (const e of excluded) if (e.reason.startsWith("POS")) warnings.push(`${e.month} POS와 카드+배달 합계 차이 확인 필요`);
  if (report.checks.some((c) => c.kind === "vat" && c.level !== "ok")) warnings.push("부가세 신고 매출과 카드+배달 합계 차이 확인 필요");
  // 급증: 직전 3개월 평균보다 30% 넘게 늘어난 달 (카드+배달 기준)
  const series = report.monthly.filter((r) => r.card_plus_delivery !== null);
  for (let i = 3; i < series.length; i++) {
    const prev = avg(series.slice(i - 3, i).map((r) => r.card_plus_delivery!));
    if (prev > 0 && series[i].card_plus_delivery! > prev * (1 + SPIKE_RATE)) warnings.push(`${series[i].month} 매출 급증 원인 확인 필요`);
  }
  // 배달 매출이 POS에 들어 있는지 (POS + 배달을 더하지 않으므로 중복 합산은 없다)
  const both = report.monthly.filter((r) => r.pos !== null && r.card !== null && r.delivery !== null);
  let deliveryNote = "";
  if (both.length) {
    const nearWith = both.filter((r) => Math.abs(r.pos! - (r.card! + r.delivery!)) <= Math.abs(r.pos! - r.card!)).length;
    deliveryNote = nearWith >= both.length / 2 ? " POS에 배달 매출이 포함된 것으로 보여요." : " POS에는 배달 매출이 빠진 것으로 보여요.";
  }

  return {
    claimed,
    verified,
    unverified: verified !== null && claimed !== null ? Math.max(0, claimed - verified) : null,
    rate,
    level,
    verified_months: verifiedMonths,
    excluded,
    basis:
      (verified === null
        ? "서로 다른 자료로 확인된 달이 없어요"
        : `카드+배달 월 매출 중 POS 또는 부가세 신고와 10% 안으로 맞는 ${verifiedMonths.length}개월 평균 (${verifiedMonths.join(", ")})`) +
      " 매출은 POS와 배달을 더하지 않아 중복 합산하지 않아요." +
      deliveryNote,
    warnings,
  };
}

// ---- 2. 시설권리금 ----

export type FacilityVerdict = "ok" | "over" | "under" | "no_claim" | "unknown" | "interior" | "excluded";
export const FACILITY_VERDICT_LABEL: Record<FacilityVerdict, string> = {
  ok: "시세 범위 내",
  over: "반영가가 추정 범위 상단 초과",
  under: "반영가가 추정 범위보다 낮음",
  no_claim: "반영가 미입력",
  unknown: "시세 미확인",
  interior: "인테리어 · 처분가 확인 어려움",
  excluded: "렌탈·리스 · 양도인 자산이 아닐 수 있어 제외",
};

export type FacilityRow = {
  name: string;
  qty: number;
  claimed: number | null;
  low: number | null; // 전체 수량 기준
  high: number | null;
  counted: number; // 확인 가능한 가치에 넣은 금액 (추정 하단)
  verdict: FacilityVerdict;
  basis: string;
};

export type FacilityResult = {
  rows: FacilityRow[];
  value: number; // 확인 가능한 시설 가치 (AI 추정 하단 합, 보수적)
  claimed: number | null; // 시설권리금
  excess: number | null; // 증빙 부족 또는 초과 요구 금액
  basis: string;
};

export function facilityResult(items: FacilityInput[], claimedFacilityPremium: number | null): FacilityResult {
  const rows: FacilityRow[] = items.map((f) => {
    const base = { name: f.name, qty: f.qty, claimed: f.claimed_value };
    if (f.ownership !== "owned") return { ...base, low: null, high: null, counted: 0, verdict: "excluded", basis: f.ownership === "rental" ? "렌탈" : "리스" };
    if (f.is_interior) return { ...base, low: null, high: null, counted: 0, verdict: "interior", basis: "인테리어는 중고로 처분하기 어려워 0원으로 봐요" };
    const e = f.estimate;
    if (!e || e.low === null || e.high === null) return { ...base, low: null, high: null, counted: 0, verdict: "unknown", basis: e?.basis ?? "AI 추정 없음" };
    const low = e.low * f.qty;
    const high = e.high * f.qty;
    const verdict: FacilityVerdict = f.claimed_value === null ? "no_claim" : f.claimed_value > high ? "over" : f.claimed_value < low ? "under" : "ok";
    return { ...base, low, high, counted: low, verdict, basis: `AI 추정 · 참고 범위 (${e.basis})` };
  });
  const value = rows.reduce((a, r) => a + r.counted, 0);
  return {
    rows,
    value,
    claimed: claimedFacilityPremium,
    excess: claimedFacilityPremium === null ? null : Math.max(0, claimedFacilityPremium - value),
    basis: items.length
      ? `소유 집기의 AI 추정 범위 하단 합 (호가·감가 기준 참고값, 실제 거래가 아님). 렌탈·리스·인테리어는 0원`
      : "시설 목록이 없어 시설 가치 미확인 (0원으로 계산)",
  };
}

// ---- 3. 수익성·손익분기점·회수기간 ----

export type PremiumParts = {
  total: number;
  business: number | null;
  facility: number | null;
  floor: number | null;
  unclassified: number; // 총액 − 나눈 금액 합
};

export function premiumParts(total: number, b: { business: number | null; facility: number | null; floor: number | null } | null): PremiumParts {
  const business = b?.business ?? null;
  const facility = b?.facility ?? null;
  const floor = b?.floor ?? null;
  return { total, business, facility, floor, unclassified: Math.max(0, total - (business ?? 0) - (facility ?? 0) - (floor ?? 0)) };
}

export type AnalysisBase = {
  sales: number | null; // 검증 기준 월매출
  sales_basis: string;
  lines: CostLine[];
  deposit: number;
  premium: PremiumParts;
  facility: FacilityResult;
  owner_weekly_hours: number | null;
  default_replacement_labor: number; // 직접 운영할 때의 추가 인건비 (내 근무시간 부족분)
  target_payback: number | null;
};

export type AnalysisAdjust = {
  premium: number; // 협상 권리금
  sales_change: number; // -0.15 / 0 / 0.1 ...
  owner_operates: boolean;
  replacement_labor: number; // 고정비에 더하는 대체 인건비 (월)
  extra_capex: number; // 인수 후 추가 시설·수리비
  target_payback: number | null;
};

export function defaultAdjust(base: AnalysisBase): AnalysisAdjust {
  return {
    premium: base.premium.total,
    sales_change: 0,
    owner_operates: true,
    replacement_labor: base.default_replacement_labor,
    extra_capex: 0,
    target_payback: base.target_payback,
  };
}

// 직접 운영하지 않으면 점주 근무시간 전부를 사람을 써서 채운다고 가정
export function absentOwnerLabor(base: AnalysisBase): number | null {
  return base.owner_weekly_hours === null ? null : Math.round(base.owner_weekly_hours * WEEKS_PER_MONTH * MIN_WAGE);
}

export type Payback = { months: number | null; basis: string };

export type Analysis = {
  sales: number | null;
  variable: number;
  fixed: number; // 대체 인건비 포함
  uncertain: number; // 고정비로 가정한 확인 필요 비용
  gross: number | null;
  margin: number | null; // 0~1
  net: number | null;
  invest: number;
  monthly_return: number | null; // 0~1
  bep: number | null;
  cushion: number | null;
  payback_excl_floor: Payback;
  payback_incl_floor: Payback;
  floor_burden: Payback;
  vs_target: number | null; // 바닥권리금 포함 회수기간 − 목표 (양수면 초과)
  assumptions: string[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeAnalysis(base: AnalysisBase, adj: AnalysisAdjust): Analysis {
  const d = adj.sales_change;
  const variableBase = base.lines.filter((l) => l.kind === "variable").reduce((a, l) => a + l.amount, 0);
  const fixedBase = base.lines.filter((l) => l.kind === "fixed").reduce((a, l) => a + l.amount, 0);
  const uncertain = base.lines.filter((l) => l.kind === "unknown").reduce((a, l) => a + l.amount, 0);
  const labor = Math.max(0, adj.replacement_labor);

  const sales = base.sales === null ? null : Math.round(base.sales * (1 + d));
  const variable = Math.round(variableBase * (1 + d)); // 매출이 바뀌면 변동비도 같은 비율
  const fixed = fixedBase + uncertain + labor;
  const gross = sales === null ? null : sales - variable;
  const margin = sales && gross !== null ? gross / sales : null;
  const net = gross === null ? null : gross - fixed;
  const invest = base.deposit + adj.premium + Math.max(0, adj.extra_capex);
  const bep = margin !== null && margin > 0 ? Math.round(fixed / margin) : null;

  // 권리금을 협상하면 바닥권리금은 그대로 두고 나머지가 줄어든다고 가정
  const floor = Math.min(base.premium.floor ?? 0, adj.premium);
  const residual = base.facility.value;
  const months = (amount: number, label: string): Payback => {
    if (net === null) return { months: null, basis: "월순수익을 알 수 없어요" };
    if (net <= 0) return { months: null, basis: "월순수익이 0 이하라 회수할 수 없어요" };
    const a = Math.max(0, amount);
    return { months: round1(a / net), basis: `${label} ${won(a)} ÷ 월순수익 ${won(net)}` };
  };
  const exclFloor = months(adj.premium - floor - residual, `(권리금 − 바닥권리금 − 확인 가능한 시설 가치)`);
  const inclFloor = months(adj.premium - residual, `(권리금 − 확인 가능한 시설 가치)`);
  const floorBurden = months(floor, "바닥권리금");

  const assumptions: string[] = [];
  if (d !== 0) assumptions.push(`매출 ${d > 0 ? "+" : ""}${Math.round(d * 100)}% (변동비도 같은 비율로 바뀌고 고정비는 그대로)`);
  if (uncertain > 0) assumptions.push(`분류가 확인 필요인 비용 ${won(uncertain)}은 고정비로 가정했어요`);
  if (labor > 0) assumptions.push(`대체 인건비 ${won(labor)}을 고정비에 더했어요 (2026년 최저시급 기준)`);
  if (base.premium.floor === null) assumptions.push("바닥권리금을 나누지 않아 바닥권리금 제외/포함 회수기간이 같아요 (미분류)");
  if (base.facility.rows.length === 0) assumptions.push("시설 목록이 없어 확인 가능한 시설 가치를 0원으로 봤어요");

  return {
    sales,
    variable,
    fixed,
    uncertain,
    gross,
    margin,
    net,
    invest,
    monthly_return: net !== null && invest > 0 ? net / invest : null,
    bep,
    cushion: sales !== null && bep !== null ? sales - bep : null,
    payback_excl_floor: exclFloor,
    payback_incl_floor: inclFloor,
    floor_burden: floorBurden,
    vs_target: inclFloor.months !== null && adj.target_payback ? round1(inclFloor.months - adj.target_payback) : null,
    assumptions,
  };
}
