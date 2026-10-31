// 양수인이 지금 볼 수 있는 자료만으로 매물 숫자를 계산한다 (코드 계산, AI 아님).
// 추천(Step 4), 에이전트 질문 만들기(Step 5), 비교표·리포트(Step 6)가 모두 이 함수를 쓴다.
// 값이 없으면 null(화면에 "미확인"). 서로 다른 기준의 매출은 섞지 않는다.

import { won } from "./format";
import type { CostCategory, DataPoint, Grade, Report, TrustLevel } from "./types";

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

  // 비용: 항목별 월평균. 비용 자료에 임차료가 없으면 매물의 월세(공개 정보)를 더한다.
  const costPoints = points.filter((p) => p.key.startsWith("cost."));
  const breakdown: Partial<Record<CostCategory, number>> = {};
  for (const cat of ["ingredients", "labor", "utilities", "rent", "fees", "other"] as CostCategory[]) {
    const s = seriesByMonth(points, `cost.${cat}`);
    if (s.size > 0) breakdown[cat] = Math.round(avg([...s.values()]));
  }
  const maintenance = points.find((p) => p.key === "lease.maintenance_fee" && p.value !== null);
  let cost: Fact = unknown("볼 수 있는 비용 자료가 없어요");
  if (costPoints.length > 0) {
    let total = Object.values(breakdown).reduce((a, b) => a + (b ?? 0), 0);
    const notes = ["비용 내역 월평균"];
    if (breakdown.rent === undefined) {
      total += listing.monthly_rent;
      notes.push(`월세 ${won(listing.monthly_rent)}(매물 정보)`);
    }
    if (maintenance) {
      total += Number(maintenance.value);
      notes.push(`관리비 ${won(Number(maintenance.value))}(임대차계약서)`);
    }
    cost = { value: Math.round(total), basis: notes.join(" + "), trust: weakestTrust(costPoints) };
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
  const remaining: Fact = leaseEnd.value
    ? { value: monthsBetween(thisMonth, leaseEnd.value), basis: `계약 만료 ${leaseEnd.value} − 이번 달 ${thisMonth}`, trust: "computed" }
    : unknown("임대차 만료일을 알 수 없어요");

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
    maintenance_fee: pointFact("lease.maintenance_fee", "임대차계약서"),
    lease_end: leaseEnd,
    lease_remaining_months: remaining,
    facility_items: points.filter((p) => p.key === "facility.item").map((p) => (p.source_note ?? "").replace(/ \(.*\)$/, "")),
    report_grade: report ? { value: report.grade, basis: "AI 교차 검증 리포트 (코드 계산 등급)", trust: "computed" } : unknown<Grade>("검증 리포트를 볼 수 없어요"),
    claimed_gap:
      gap && gap.diff_rate !== null
        ? { value: Math.round(gap.diff_rate * 1000) / 10, basis: `양도인 주장 ${won(gap.claimed_monthly_sales)} vs 검증 ${won(gap.verified_monthly_avg)}`, trust: "computed" }
        : unknown("검증 리포트를 볼 수 없어요"),
    report_warnings: report ? report.checks.filter((c) => c.level !== "ok").map((c) => `${c.title} — ${c.detail}`) : [],
    visible_points: points.length,
  };
}

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
  if (f.claimed_gap.value !== null && Math.abs(f.claimed_gap.value) > 15) {
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
  if (f.monthly_cost_avg.value === null) {
    risks.push({ severity: 1, title: "비용 자료를 확인하지 못했어요", evidence: f.monthly_cost_avg.basis, impact: "실제 순수익을 알 수 없어요", how_to_check: "재료비·인건비·공과금 내역을 요청해요" });
  }
  if (f.monthly_sales_avg.value === null) {
    risks.push({ severity: 1, title: "매출 자료를 확인하지 못했어요", evidence: f.monthly_sales_avg.basis, impact: "매출을 검증할 수 없어요", how_to_check: "카드매출·부가세 자료 열람을 요청해요" });
  }
  return risks.sort((a, b) => b.severity - a.severity);
}
