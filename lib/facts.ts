// 양수인이 지금 볼 수 있는 자료만으로 매물 숫자를 계산한다 (코드 계산, AI 아님).
// 추천(Step 4), 에이전트 질문 만들기(Step 5), 비교표·리포트(Step 6)가 모두 이 함수를 쓴다.
// 값이 없으면 null(화면에 "미확인"). 서로 다른 기준의 매출은 섞지 않는다.

import { facilityResult, premiumParts, salesEvidence, type AnalysisBase, type CostLine, type FacilityResult, type PremiumParts, type SalesEvidence } from "./analysis";
import { DOC_COST_KIND } from "./costs";
import { won } from "./format";
import type { CostCategory, CostInput, CostKind, DataPoint, FacilityInput, Grade, LaborInput, PremiumBreakdown, Report, TrustLevel } from "./types";

export type FactTrust = TrustLevel | "computed" | "listing";

export type Fact<T = number> = {
  value: T | null;
  basis: string; // 출처·계산 가정
  trust: FactTrust;
};

export type BuyerProfile = {
  budget_total: number | null;
  regions: string[];
  business_types: string[];
  target_monthly_profit: number | null;
  weekly_hours: number | null;
  experience: string | null;
  payback_months: number | null;
  notes: string | null;
};

export type ListingBasics = {
  id: string;
  name: string;
  area: string;
  business_type: string;
  premium: number;
  deposit: number;
  monthly_rent: number;
  is_sample: boolean;
  premium_breakdown: PremiumBreakdown | null;
  maintenance_fee: number | null; // 양도인 입력 (L0)
  lease_remaining_months: number | null; // 양도인 입력 (L0)
  claimed_monthly_cash_sales: number | null; // 검증 리포트를 볼 수 있을 때만 채운다
};

export type ListingFacts = {
  listing: ListingBasics;
  initial_investment: Fact;
  monthly_sales_avg: Fact;
  sales_volatility: Fact; // 변동계수(%)
  monthly_cost_avg: Fact;
  cost_breakdown: Partial<Record<CostCategory, number>>;
  confirmed_profit: Fact;
  owner_weekly_hours: Fact;
  staff_count: Fact;
  maintenance_fee: Fact;
  lease_end: Fact<string>;
  lease_remaining_months: Fact;
  facility_items: string[];
  report_grade: Fact<Grade>;
  claimed_gap: Fact; // 양도인 주장 월매출 대비 검증 매출 차이(%) — 리포트를 볼 수 있을 때만
  report_warnings: string[];
  visible_points: number;
  // F08
  cost_lines: CostLine[]; // 변동비/고정비 분류가 붙은 월 비용 (입력이 있으면 입력, 없으면 파일 자료)
  cost_source: "input" | "document" | null;
  labor: LaborInput | null;
  facilities: FacilityInput[];
  facility: FacilityResult;
  premium_parts: PremiumParts;
  evidence: SalesEvidence;
};

export const MIN_WAGE_2026 = 10_320; // 2026년 최저시급 (원) — 추가 인건비 계산 가정
const WEEKS_PER_MONTH = 4.345;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const unknown = <T = number>(basis: string): Fact<T> => ({ value: null, basis, trust: "computed" });

function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function seriesByMonth(points: DataPoint[], key: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of points) {
    if (p.key !== key || p.value === null || !p.period) continue;
    map.set(p.period, (map.get(p.period) ?? 0) + Number(p.value));
  }
  return map;
}

function weakestTrust(points: DataPoint[]): FactTrust {
  return points.some((p) => p.trust_level === "owner_stated") ? "owner_stated" : "submitted";
}

export function computeFacts(
  listing: ListingBasics,
  points: DataPoint[],
  report: Report | null,
  today = new Date(),
): ListingFacts {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  // 매출: 카드+배달 (카드가 있는 달만) → 없으면 POS(현금 포함, 따로 표시) → 없으면 부가세 과세표준 ÷ 개월
  const card = seriesByMonth(points, "card_sales.gross_sales");
  const delivery = seriesByMonth(points, "delivery_app.gross_sales");
  const pos = seriesByMonth(points, "pos.gross_sales");
  const salesPoints = points.filter((p) => /^(card_sales|delivery_app|pos|vat_return)\./.test(p.key));
  let sales: Fact = unknown("볼 수 있는 매출 자료가 없어요");
  let series: number[] = [];
  if (card.size > 0) {
    const months = [...card.keys()].sort();
    series = months.map((m) => (card.get(m) ?? 0) + (delivery.get(m) ?? 0));
    sales = {
      value: Math.round(avg(series)),
      basis: `카드${delivery.size ? "+배달" : ""} 월 매출 ${months.length}개월 평균 (${months[0]}~${months[months.length - 1]})`,
      trust: weakestTrust(salesPoints),
    };
  } else if (pos.size > 0) {
    const months = [...pos.keys()].sort();
    series = months.map((m) => pos.get(m)!);
    sales = { value: Math.round(avg(series)), basis: `POS 월 매출 ${months.length}개월 평균 (현금 포함, 카드 자료 없음)`, trust: weakestTrust(salesPoints) };
  } else {
    const vat = points.find((p) => p.key === "vat_return.stated_total" && p.value !== null && p.period);
    if (vat) {
      const [s, e] = vat.period!.split("~");
      const n = monthsBetween(s, e) + 1;
      sales = { value: Math.round(Number(vat.value) / n), basis: `부가세 과세표준 ÷ ${n}개월`, trust: vat.trust_level };
    }
  }
  const volatility: Fact =
    series.length >= 3
      ? {
          value: Math.round((Math.sqrt(avg(series.map((x) => (x - avg(series)) ** 2))) / avg(series)) * 1000) / 10,
          basis: `월 매출 ${series.length}개월의 변동계수 (표준편차 ÷ 평균)`,
          trust: "computed",
        }
      : unknown("월별 매출이 3개월 이상 있어야 계산해요");

  // 비용: 양도인이 직접 입력한 월 비용이 있으면 그것을, 없으면 파일에서 읽은 항목별 월평균을 쓴다 (둘을 더하지 않는다).
  // 비용에 임차료가 없으면 매물의 월세(공개 정보)를, 관리비를 알면 관리비를 고정비로 더한다.
  const costPoints = points.filter((p) => p.key.startsWith("cost."));
  const inputCosts = points.filter((p) => p.key === "input.cost" && p.value !== null);
  const breakdown: Partial<Record<CostCategory, number>> = {};
  for (const cat of ["ingredients", "labor", "utilities", "rent", "fees", "other"] as CostCategory[]) {
    const s = seriesByMonth(points, `cost.${cat}`);
    if (s.size > 0) breakdown[cat] = Math.round(avg([...s.values()]));
  }
  const maintenance = points.find((p) => p.key === "lease.maintenance_fee" && p.value !== null);
  const maintenanceValue = maintenance ? Number(maintenance.value) : listing.maintenance_fee;
  const maintenanceNote = maintenance ? "임대차계약서" : "양도인 입력";
  const lines: CostLine[] = [];
  let costSource: ListingFacts["cost_source"] = null;
  if (inputCosts.length > 0) {
    costSource = "input";
    for (const p of inputCosts) {
      const m = (p.meta ?? {}) as Partial<CostInput>;
      lines.push({ name: p.source_note ?? "비용", amount: Number(p.value), kind: (m.kind ?? "unknown") as CostKind, source: "input", note: m.kind_source === "user" ? "양도인 입력 · 분류 직접 지정" : "양도인 입력 · 이름으로 자동 분류" });
    }
  } else if (costPoints.length > 0) {
    costSource = "document";
    for (const [cat, v] of Object.entries(breakdown) as [CostCategory, number][]) {
      lines.push({ name: COST_NAME[cat], amount: v, kind: DOC_COST_KIND[cat], source: "document", note: "비용 내역 월평균" });
    }
  }
  if (costSource) {
    const hasRent = costSource === "document" ? breakdown.rent !== undefined : lines.some((l) => /월세|임차/.test(l.name));
    if (!hasRent) lines.push({ name: "월세", amount: listing.monthly_rent, kind: "fixed", source: "listing", note: "매물 정보" });
    if (maintenanceValue !== null && maintenanceValue > 0 && !lines.some((l) => /관리비/.test(l.name))) {
      lines.push({ name: "관리비", amount: maintenanceValue, kind: "fixed", source: "listing", note: maintenanceNote });
    }
  }
  let cost: Fact = unknown("볼 수 있는 비용 자료가 없어요");
  if (costSource) {
    const total = lines.reduce((a, l) => a + l.amount, 0);
    const extras = lines.filter((l) => l.source === "listing").map((l) => `${l.name} ${won(l.amount)}(${l.note})`);
    cost = {
      value: Math.round(total),
      basis: [costSource === "input" ? `양도인 입력 월 비용 ${inputCosts.length}개 항목` : "비용 내역 월평균", ...extras].join(" + "),
      trust: costSource === "input" ? "owner_stated" : weakestTrust(costPoints),
    };
  }

  const profit: Fact =
    sales.value !== null && cost.value !== null
      ? { value: sales.value - cost.value, basis: `월평균 매출 ${won(sales.value)} − 월평균 비용 ${won(cost.value)}`, trust: "computed" }
      : unknown(sales.value === null ? "매출 자료가 없어 계산할 수 없어요" : "비용 자료가 없어 계산할 수 없어요");

  const pointFact = (key: string, label: string): Fact => {
    const p = points.find((x) => x.key === key && x.value !== null);
    return p ? { value: Number(p.value), basis: p.source_note ?? label, trust: p.trust_level } : unknown(`${label} 자료가 없어요`);
  };
  const leaseEndPoint = points.find((p) => p.key === "lease.end" && p.period);
  const leaseEnd: Fact<string> = leaseEndPoint
    ? { value: leaseEndPoint.period, basis: leaseEndPoint.source_note ?? "임대차계약서", trust: leaseEndPoint.trust_level }
    : unknown<string>("임대차계약서를 볼 수 없어요");
  // 임대차계약서가 우선, 없으면 양도인이 입력한 잔여기간
  const remaining: Fact = leaseEnd.value
    ? { value: monthsBetween(thisMonth, leaseEnd.value), basis: `계약 만료 ${leaseEnd.value} − 이번 달 ${thisMonth}`, trust: "computed" }
    : listing.lease_remaining_months !== null
      ? { value: listing.lease_remaining_months, basis: "양도인 입력 (임대차계약서 미확인)", trust: "owner_stated" }
      : unknown("임대차 만료일을 알 수 없어요");

  // 양도인 입력: 인력 구성, 시설 목록
  const laborPoint = points.find((p) => p.key === "input.labor");
  const labor = laborPoint ? ({ family: 0, staff: 0, ...(laborPoint.meta ?? {}) } as LaborInput) : null;
  const facilities: FacilityInput[] = points
    .filter((p) => p.key === "input.facility")
    .map((p) => ({ ...(p.meta as Omit<FacilityInput, "name" | "claimed_value">), name: p.source_note ?? "시설", claimed_value: p.value === null ? null : Number(p.value) }));
  const parts = premiumParts(listing.premium, listing.premium_breakdown);
  const hasCashEvidence = points.some((p) => /^(cash_receipt|bank_statement)\./.test(p.key));

  const gap = report?.claimed_vs_actual;
  return {
    listing,
    initial_investment: { value: listing.premium + listing.deposit, basis: `희망 권리금 ${won(listing.premium)} + 보증금 ${won(listing.deposit)} (추가 설비·운영 자금 제외)`, trust: "listing" },
    monthly_sales_avg: sales,
    sales_volatility: volatility,
    monthly_cost_avg: cost,
    cost_breakdown: breakdown,
    confirmed_profit: profit,
    owner_weekly_hours: pointFact("operation.owner_weekly_hours", "운영 현황"),
    staff_count: pointFact("operation.staff_count", "운영 현황"),
    maintenance_fee:
      maintenanceValue !== null
        ? { value: maintenanceValue, basis: maintenanceNote, trust: maintenance ? maintenance.trust_level : "owner_stated" }
        : unknown("관리비 정보가 없어요"),
    lease_end: leaseEnd,
    lease_remaining_months: remaining,
    facility_items: [
      ...points.filter((p) => p.key === "facility.item").map((p) => (p.source_note ?? "").replace(/ \(.*\)$/, "")),
      ...facilities.map((f) => f.name),
    ],
    report_grade: report ? { value: report.grade, basis: "AI 교차 검증 리포트 (코드 계산 등급)", trust: "computed" } : unknown<Grade>("검증 리포트를 볼 수 없어요"),
    claimed_gap:
      gap && gap.diff_rate !== null
        ? { value: Math.round(gap.diff_rate * 1000) / 10, basis: `양도인 주장 ${won(gap.claimed_monthly_sales)} vs 검증 ${won(gap.verified_monthly_avg)}`, trust: "computed" }
        : unknown("검증 리포트를 볼 수 없어요"),
    report_warnings: report ? report.checks.filter((c) => c.level !== "ok").map((c) => `${c.title} — ${c.detail}`) : [],
    visible_points: points.length,
    cost_lines: lines,
    cost_source: costSource,
    labor,
    facilities,
    facility: facilityResult(facilities, parts.facility),
    premium_parts: parts,
    evidence: salesEvidence(report, listing.claimed_monthly_cash_sales, hasCashEvidence),
  };
}

const COST_NAME: Record<CostCategory, string> = { ingredients: "재료비", labor: "인건비", utilities: "공과금", rent: "임차료", fees: "수수료", other: "기타 비용" };

// ---- 양수인 맞춤 계산 ----

export type PersonalFit = {
  extra_labor_cost: Fact; // 점주 근무시간을 양수인이 다 못 채울 때 추가 인건비
  expected_profit: Fact;
  payback_months: Fact;
  within_budget: boolean | null;
  meets_target: boolean | null;
};

export function personalFit(f: ListingFacts, p: BuyerProfile | null): PersonalFit {
  const owner = f.owner_weekly_hours.value;
  const mine = p?.weekly_hours ?? null;
  let extra: Fact;
  if (owner === null) extra = unknown("점주 근무시간을 알 수 없어요");
  else if (mine === null) extra = unknown("내 근무 가능 시간을 인수 조건에 입력해주세요");
  else {
    const hours = Math.max(0, owner - mine);
    extra = {
      value: Math.round(hours * WEEKS_PER_MONTH * MIN_WAGE_2026),
      basis: `(점주 주 ${owner}시간 − 내 주 ${mine}시간) × ${WEEKS_PER_MONTH}주 × 시급 ${won(MIN_WAGE_2026)} (2026년 최저임금 가정, 주휴·4대보험 제외)`,
      trust: "ai_estimate",
    };
  }
  const base = f.confirmed_profit.value;
  const expected: Fact =
    base === null
      ? unknown(f.confirmed_profit.basis)
      : extra.value === null
        ? { value: base, basis: `${f.confirmed_profit.basis} (추가 인건비 미반영: ${extra.basis})`, trust: "ai_estimate" }
        : { value: base - extra.value, basis: `확인된 월 순수익 ${won(base)} − 추가 인건비 ${won(extra.value)}`, trust: "ai_estimate" };
  const invest = f.initial_investment.value!;
  const payback: Fact =
    expected.value !== null && expected.value > 0
      ? { value: Math.round((invest / expected.value) * 10) / 10, basis: `초기 투자금 ${won(invest)} ÷ 예상 월 순수익 ${won(expected.value)}`, trust: "ai_estimate" }
      : unknown(expected.value === null ? "예상 순수익을 알 수 없어요" : "예상 순수익이 0 이하라 회수할 수 없어요");
  return {
    extra_labor_cost: extra,
    expected_profit: expected,
    payback_months: payback,
    within_budget: p?.budget_total ? invest <= p.budget_total : null,
    meets_target: p?.target_monthly_profit && expected.value !== null ? expected.value >= p.target_monthly_profit : null,
  };
}

// ---- 추천 점수 (가중치 공개) ----

export const SCORE_WEIGHTS = { budget: 25, region: 15, business: 15, profit: 20, hours: 10, verification: 15 } as const;
export const SCORE_LABEL: Record<keyof typeof SCORE_WEIGHTS, string> = {
  budget: "예산",
  region: "지역",
  business: "업종",
  profit: "목표 수익",
  hours: "직접 운영",
  verification: "자료 검증",
};

export type ScoreItem = { key: keyof typeof SCORE_WEIGHTS; score: number | null; max: number; reason: string };

export function recommend(f: ListingFacts, fit: PersonalFit, p: BuyerProfile | null) {
  const W = SCORE_WEIGHTS;
  const items: ScoreItem[] = [];
  const invest = f.initial_investment.value!;
  items.push(
    p?.budget_total
      ? { key: "budget", score: invest <= p.budget_total ? W.budget : 0, max: W.budget, reason: invest <= p.budget_total ? `초기 투자금 ${won(invest)} ≤ 예산 ${won(p.budget_total)}` : `예산보다 ${won(invest - p.budget_total)} 많아요` }
      : { key: "budget", score: null, max: W.budget, reason: "예산을 입력하지 않았어요" },
  );
  const regionHit = p?.regions.length ? p.regions.some((r) => f.listing.area.includes(r)) : null;
  items.push({ key: "region", score: regionHit === null ? null : regionHit ? W.region : 0, max: W.region, reason: regionHit === null ? "희망 지역 없음" : regionHit ? `${f.listing.area} — 희망 지역` : `${f.listing.area} — 희망 지역 아님` });
  const typeHit = p?.business_types.length ? p.business_types.includes(f.listing.business_type) : null;
  items.push({ key: "business", score: typeHit === null ? null : typeHit ? W.business : 0, max: W.business, reason: typeHit === null ? "선호 업종 없음" : typeHit ? `${f.listing.business_type} — 선호 업종` : `${f.listing.business_type} — 선호 업종 아님` });
  const target = p?.target_monthly_profit ?? null;
  const exp = fit.expected_profit.value;
  items.push(
    exp === null || target === null
      ? { key: "profit", score: null, max: W.profit, reason: exp === null ? "순수익 정보 부족" : "목표 수익을 입력하지 않았어요" }
      : { key: "profit", score: Math.max(0, Math.min(W.profit, Math.round((exp / target) * W.profit))), max: W.profit, reason: `예상 월 순수익 ${won(exp)} / 목표 ${won(target)}` },
  );
  const owner = f.owner_weekly_hours.value;
  items.push(
    owner === null || !p?.weekly_hours
      ? { key: "hours", score: null, max: W.hours, reason: owner === null ? "점주 근무시간 정보 부족" : "내 근무 가능 시간을 입력하지 않았어요" }
      : { key: "hours", score: Math.round(Math.min(1, p.weekly_hours / owner) * W.hours), max: W.hours, reason: `점주 주 ${owner}시간 / 나 주 ${p.weekly_hours}시간` },
  );
  const gradeScore: Record<Grade, number> = { A: 15, B: 11, C: 6, D: 2 };
  items.push(
    f.report_grade.value
      ? { key: "verification", score: gradeScore[f.report_grade.value], max: W.verification, reason: `교차 검증 등급 ${f.report_grade.value}` }
      : { key: "verification", score: null, max: W.verification, reason: "검증 리포트를 볼 수 없어요" },
  );
  const known = items.filter((i) => i.score !== null);
  const total = known.reduce((a, i) => a + (i.score ?? 0), 0);
  const unknownCount = items.length - known.length;
  return { total, max: 100, items, info_lacking: unknownCount >= 2, unknown_count: unknownCount };
}

// ---- 위험 요인 (코드로 찾고, 심각한 순서) ----

export type Risk = { severity: 3 | 2 | 1; title: string; evidence: string; impact: string; how_to_check: string };

export function findRisks(f: ListingFacts, fit: PersonalFit, p: BuyerProfile | null): Risk[] {
  const risks: Risk[] = [];
  for (const w of f.report_warnings) {
    risks.push({ severity: 3, title: w.split(" — ")[0], evidence: w.split(" — ")[1] ?? "교차 검증 리포트", impact: "매출을 근거로 한 권리금 판단이 달라질 수 있어요", how_to_check: "해당 달의 상세 매출 내역(일별 POS, 통장 입금)을 요청해요" });
  }
  // 리포트 경고에 이미 같은 내용(주장 매출 차이)이 있으면 한 번만 쓴다
  const claimedInReport = f.report_warnings.some((w) => w.startsWith("양도인이 말한 월매출"));
  if (!claimedInReport && f.claimed_gap.value !== null && Math.abs(f.claimed_gap.value) > 15) {
    risks.push({ severity: 3, title: `양도인 주장 월매출과 자료가 ${Math.abs(f.claimed_gap.value)}% 달라요`, evidence: f.claimed_gap.basis, impact: "권리금이 주장 매출 기준이면 높게 잡혔을 수 있어요", how_to_check: "주장 매출의 근거 자료(현금 매출 장부 등)를 요청해요" });
  }
  if (fit.within_budget === false) {
    risks.push({ severity: 3, title: "초기 투자금이 예산을 넘어요", evidence: f.initial_investment.basis, impact: "추가 대출이나 투자 없이는 인수하기 어려워요", how_to_check: "권리금 조정이 가능한지 확인해요" });
  }
  if (f.lease_remaining_months.value !== null && f.lease_remaining_months.value < 24) {
    risks.push({ severity: f.lease_remaining_months.value < 12 ? 3 : 2, title: `임대차 계약이 ${f.lease_remaining_months.value}개월 남았어요`, evidence: f.lease_remaining_months.basis, impact: "만료 뒤 월세 인상이나 재계약 거절로 권리금을 회수하지 못할 수 있어요", how_to_check: "임대인의 재계약 의사와 조건을 공인중개사를 통해 확인해요" });
  }
  if (fit.extra_labor_cost.value) {
    risks.push({ severity: 2, title: "점주보다 근무할 수 있는 시간이 적어요", evidence: fit.extra_labor_cost.basis, impact: `월 ${won(fit.extra_labor_cost.value)} 정도 인건비가 더 들 수 있어요 (가정)`, how_to_check: "점주의 실제 근무 시간표와 직원 근무 내역을 요청해요" });
  }
  if (fit.meets_target === false) {
    risks.push({ severity: 2, title: "예상 순수익이 목표보다 적어요", evidence: fit.expected_profit.basis, impact: `목표 ${won(p?.target_monthly_profit)}에 못 미쳐요`, how_to_check: "비용 절감 여지(인건비·재료비)를 확인해요" });
  }
  // F08: 매출 증빙·비용 분류·시설권리금
  for (const w of f.evidence.warnings.filter((w) => w.startsWith("현금매출"))) {
    risks.push({ severity: 2, title: "현금매출 증빙 부족", evidence: w, impact: "주장 매출 중 현금 부분은 확인되지 않은 금액이에요", how_to_check: "현금영수증 발행 내역이나 사업용 계좌 입금 내역을 요청해요" });
  }
  if (f.evidence.level === "low") {
    risks.push({ severity: 3, title: `매출 증빙 수준이 낮아요 (증빙률 ${Math.round((f.evidence.rate ?? 0) * 1000) / 10}%)`, evidence: f.evidence.basis, impact: `주장 매출 중 ${won(f.evidence.unverified)}이 자료로 확인되지 않았어요`, how_to_check: "부가세 신고서·POS 일별 매출 등 다른 자료를 요청해요" });
  }
  if (f.labor && f.labor.family > 0) {
    risks.push({ severity: 2, title: "가족·동업자 인건비가 비용에 빠져 있을 수 있어요", evidence: `양도인 입력: 가족·동업자 ${f.labor.family}명`, impact: "양수인이 사람을 쓰면 그만큼 인건비가 늘어요", how_to_check: "가족·동업자의 근무 시간표를 받고, 아래 조정에서 대체 인건비를 넣어봐요" });
  }
  const unknownCost = f.cost_lines.filter((l) => l.kind === "unknown");
  if (unknownCost.length > 0) {
    risks.push({ severity: 1, title: "변동비인지 고정비인지 모르는 비용이 있어요", evidence: unknownCost.map((l) => `${l.name} ${won(l.amount)}`).join(", "), impact: "손익분기점은 고정비로 보고 넉넉하게 계산했어요", how_to_check: "매출에 따라 바뀌는 비용인지 양도인에게 확인해요" });
  }
  if (f.facility.excess !== null && f.facility.excess > 0 && f.facility.rows.length > 0) {
    risks.push({ severity: 2, title: `시설권리금 중 ${won(f.facility.excess)} 시세 초과 또는 근거 부족`, evidence: `시설권리금 ${won(f.facility.claimed)} vs 확인 가능한 시설 가치 ${won(f.facility.value)} (AI 추정 참고 범위)`, impact: "시설권리금이 실제 처분 가치보다 높게 잡혔을 수 있어요", how_to_check: "구매 영수증·모델명을 받고, 같은 모델의 중고 매물을 직접 찾아봐요" });
  }
  const leased = f.facility.rows.filter((r) => r.verdict === "excluded");
  if (leased.length > 0) {
    risks.push({ severity: 2, title: "렌탈·리스 시설이 시설 목록에 있어요", evidence: leased.map((r) => r.name).join(", "), impact: "양도인 자산이 아니라 넘겨받지 못하거나 남은 렌탈료를 떠안을 수 있어요", how_to_check: "렌탈·리스 계약서와 남은 기간·위약금을 확인해요" });
  }
  if (f.monthly_cost_avg.value === null) {
    risks.push({ severity: 1, title: "비용 자료를 확인하지 못했어요", evidence: f.monthly_cost_avg.basis, impact: "실제 순수익을 알 수 없어요", how_to_check: "재료비·인건비·공과금 내역을 요청해요" });
  }
  if (f.monthly_sales_avg.value === null) {
    risks.push({ severity: 1, title: "매출 자료를 확인하지 못했어요", evidence: f.monthly_sales_avg.basis, impact: "매출을 검증할 수 없어요", how_to_check: "카드매출·부가세 자료 열람을 요청해요" });
  }
  return risks.sort((a, b) => b.severity - a.severity);
}

// ---- 투자금 회수 시나리오 (권리금을 하나의 정답 가격으로 말하지 않는다, PRD 7.3) ----

export type Scenario = { label: string; sales_change: number; monthly_profit: number | null; payback_months: number | null; basis: string };

// 매출이 ±10% 바뀌면 재료비·수수료도 같은 비율로 바뀌고, 나머지 비용은 그대로라고 가정한다
export function paybackScenarios(f: ListingFacts, fit: PersonalFit): Scenario[] {
  const sales = f.monthly_sales_avg.value;
  const cost = f.monthly_cost_avg.value;
  const variable = (f.cost_breakdown.ingredients ?? 0) + (f.cost_breakdown.fees ?? 0);
  const extra = fit.extra_labor_cost.value ?? 0;
  const invest = f.initial_investment.value!;
  return [-0.1, 0, 0.1].map((d) => {
    const label = d < 0 ? "보수적 (매출 −10%)" : d > 0 ? "낙관적 (매출 +10%)" : "현재 수준";
    if (sales === null || cost === null) {
      return { label, sales_change: d, monthly_profit: null, payback_months: null, basis: "매출 또는 비용을 알 수 없어요" };
    }
    const profit = Math.round(sales * (1 + d) - (cost + variable * d) - extra);
    return {
      label,
      sales_change: d,
      monthly_profit: profit,
      payback_months: profit > 0 ? Math.round((invest / profit) * 10) / 10 : null,
      basis: `매출 ${won(sales)} × ${1 + d} − 비용 ${won(cost)}(재료비·수수료 ${Math.round(d * 100)}% 반영) − 추가 인건비 ${won(extra)} (AI 추정)`,
    };
  });
}

// ---- F08: 수익성·회수기간 계산의 출발점 (lib/analysis.ts computeAnalysis에 넣는다) ----

export function analysisBase(f: ListingFacts, fit: PersonalFit, p: BuyerProfile | null): AnalysisBase {
  const verified = f.evidence.verified;
  return {
    sales: verified ?? f.monthly_sales_avg.value,
    sales_basis: verified !== null ? `교차 확인된 월매출 (${f.evidence.basis})` : f.monthly_sales_avg.value !== null ? `자료상 월평균 매출 — 교차 확인 전 (${f.monthly_sales_avg.basis})` : f.monthly_sales_avg.basis,
    lines: f.cost_lines,
    deposit: f.listing.deposit,
    premium: f.premium_parts,
    facility: f.facility,
    owner_weekly_hours: f.owner_weekly_hours.value,
    default_replacement_labor: fit.extra_labor_cost.value ?? 0,
    target_payback: p?.payback_months ?? null,
  };
}
