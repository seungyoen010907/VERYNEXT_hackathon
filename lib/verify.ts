import "server-only";

// AI 2단계 대신 코드로 하는 교차 검증·등급 계산 (docs/API.md 6번 "2단계: 코드 검증 규칙").
// 숫자 비교·합계·등급은 AI에게 맡기지 않는다. 기준(1%, 10%, 15%)은 임의로 정한 값이다.

import type {
  Check,
  CheckLevel,
  ClaimedVsActual,
  DocType,
  Extraction,
  ExtractedDocument,
  Grade,
  MonthlyRow,
} from "./types";

const SUM_TOLERANCE = 0.01; // 합계 검산
const CROSS_TOLERANCE = 0.1; // POS vs 카드+배달, 부가세 vs 카드+배달
const CLAIM_TOLERANCE = 0.15; // 주장 vs 실제

export type VerifyResult = {
  checks: Check[];
  monthly: MonthlyRow[];
  claimed_vs_actual: ClaimedVsActual;
  grade: Grade;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

// "2026-01" ~ "2026-06" -> ["2026-01", ..., "2026-06"]
function monthRange(start: string, end: string): string[] {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (out.length > 120) break; // 기간이 이상하게 길면 멈춘다
  }
  return out;
}

// 같은 종류 자료가 여러 개면(배달앱 2개 등) 같은 달끼리 더한다
function monthlyByType(docs: ExtractedDocument[], type: DocType): Map<string, number> {
  const map = new Map<string, number>();
  for (const doc of docs.filter((d) => d.doc_type === type)) {
    for (const row of doc.monthly) {
      if (row.gross_sales === null) continue;
      map.set(row.month, (map.get(row.month) ?? 0) + row.gross_sales);
    }
  }
  return map;
}

export function verify(extraction: Extraction, claimedMonthlySales: number): VerifyResult {
  const docs = extraction.documents.filter((d) => d.readability !== "unreadable");
  const checks: Check[] = [];

  // 1. 합계 검산: 월별 합산 vs 자료에 적힌 합계
  for (const doc of docs) {
    const values = doc.monthly.map((m) => m.gross_sales).filter((v): v is number => v !== null);
    if (doc.stated_total === null || doc.stated_total === 0 || values.length === 0) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    const rate = Math.abs(sum - doc.stated_total) / doc.stated_total;
    checks.push({
      kind: "sum",
      level: rate > SUM_TOLERANCE ? "warn" : "ok",
      month: null,
      title: rate > SUM_TOLERANCE ? `${doc.file_name} 합계가 월별 합산과 달라요` : `${doc.file_name} 합계 검산`,
      detail: `월별 합산 ${won(sum)} vs 자료에 적힌 합계 ${won(doc.stated_total)} (${pct(rate)} 차이, 기준 1%)`,
    });
  }

  // 2. 빠진 달
  for (const doc of docs) {
    if (!doc.period_start || !doc.period_end || doc.monthly.length === 0) continue;
    const have = new Set(doc.monthly.map((m) => m.month));
    const missing = monthRange(doc.period_start, doc.period_end).filter((m) => !have.has(m));
    if (missing.length > 0) {
      checks.push({
        kind: "missing_month",
        level: "caution",
        month: null,
        title: `${doc.file_name}에 빠진 달이 있어요`,
        detail: `자료 기간 ${doc.period_start}~${doc.period_end} 중 ${missing.join(", ")} 자료가 없어요`,
      });
    }
  }

  // 3. 사업자번호
  const numbers = [...new Set(docs.map((d) => d.business_number).filter((n): n is string => !!n))];
  if (numbers.length > 1) {
    checks.push({
      kind: "business_number",
      level: "warn",
      month: null,
      title: "자료마다 사업자번호가 달라요",
      detail: docs
        .filter((d) => d.business_number)
        .map((d) => `${d.file_name}: ${d.business_number}`)
        .join(", "),
    });
  } else if (numbers.length === 1) {
    checks.push({
      kind: "business_number",
      level: "ok",
      month: null,
      title: "사업자번호 일치",
      detail: `사업자번호가 적힌 자료 모두 ${numbers[0]}`,
    });
  }

  // 4. 월별 표 + POS vs (카드 + 배달)
  const card = monthlyByType(docs, "card_sales");
  const delivery = monthlyByType(docs, "delivery_app");
  const pos = monthlyByType(docs, "pos");
  const months = [...new Set([...card.keys(), ...delivery.keys(), ...pos.keys()])].sort();

  const monthly: MonthlyRow[] = months.map((month) => {
    const c = card.get(month) ?? null;
    const d = delivery.get(month) ?? null;
    const p = pos.get(month) ?? null;
    const cd = c === null && d === null ? null : (c ?? 0) + (d ?? 0);
    const rate = p !== null && cd ? (p - cd) / cd : null;
    const level: CheckLevel = rate !== null && Math.abs(rate) >= CROSS_TOLERANCE ? "warn" : "ok";
    if (level === "warn" && rate !== null && cd !== null && p !== null) {
      checks.push({
        kind: "cross_source",
        level,
        month,
        title: `${month} POS 매출이 카드+배달 합계보다 ${rate > 0 ? "많아요" : "적어요"}`,
        detail: `POS ${won(p)} vs 카드+배달 ${won(cd)} (${pct(Math.abs(rate))} 차이, 기준 10%)`,
      });
    }
    return { month, card: c, delivery: d, pos: p, card_plus_delivery: cd, pos_diff_rate: rate, level };
  });

  // 5. 부가세 과세표준 vs 같은 기간 (카드 + 배달)
  const vat = docs.find((d) => d.doc_type === "vat_return" && d.stated_total !== null);
  const vatMonths = vat?.period_start && vat.period_end ? monthRange(vat.period_start, vat.period_end) : [];
  if (vat && vat.stated_total !== null && vatMonths.length > 0 && card.size > 0) {
    const covered = vatMonths.filter((m) => card.has(m) || delivery.has(m));
    const cdTotal = covered.reduce((a, m) => a + (card.get(m) ?? 0) + (delivery.get(m) ?? 0), 0);
    if (covered.length > 0 && cdTotal > 0) {
      const rate = (vat.stated_total - cdTotal) / cdTotal;
      const partial = covered.length < vatMonths.length ? ` · 카드·배달 자료가 ${covered.length}/${vatMonths.length}개월만 있음` : "";
      checks.push({
        kind: "vat",
        level: Math.abs(rate) > CROSS_TOLERANCE ? "caution" : "ok",
        month: null,
        title: "부가세 과세표준과 카드+배달 합계 비교",
        detail: `과세표준 ${won(vat.stated_total)} vs 카드+배달 ${won(cdTotal)} (${pct(Math.abs(rate))} 차이, 기준 10%)${partial}`,
      });
    }
  }

  // 6. 주장 vs 실제: 검증 월평균 = 카드 + 배달 월별 합계의 평균. 카드가 없으면 부가세 과세표준 ÷ 개월 수
  let verifiedAvg: number | null = null;
  let basis = "검증할 자료가 부족해요";
  const cardMonths = monthly.filter((r) => r.card !== null);
  if (cardMonths.length > 0) {
    verifiedAvg = cardMonths.reduce((a, r) => a + (r.card_plus_delivery ?? 0), 0) / cardMonths.length;
    basis = `카드 + 배달 월별 합계의 평균 (${cardMonths[0].month}~${cardMonths[cardMonths.length - 1].month}, ${cardMonths.length}개월)`;
  } else if (vat && vat.stated_total !== null && vatMonths.length > 0) {
    verifiedAvg = vat.stated_total / vatMonths.length;
    basis = `부가세 과세표준 ÷ ${vatMonths.length}개월 (카드 자료 없음)`;
  }

  const diff = verifiedAvg === null ? null : verifiedAvg - claimedMonthlySales;
  const diffRate = diff === null || claimedMonthlySales === 0 ? null : diff / claimedMonthlySales;
  const claimedLevel: CheckLevel = diffRate !== null && Math.abs(diffRate) > CLAIM_TOLERANCE ? "warn" : "ok";
  if (verifiedAvg !== null) {
    checks.push({
      kind: "claimed",
      level: claimedLevel,
      month: null,
      title: claimedLevel === "warn" ? "양도인이 말한 월매출과 자료가 많이 달라요" : "양도인 주장 월매출과 비교",
      detail: `주장 ${won(claimedMonthlySales)} vs 검증 월평균 ${won(verifiedAvg)} (${pct(Math.abs(diffRate ?? 0))} 차이, 기준 15%)`,
    });
  }

  // 등급: 확인 필요 0개 A, 1개 B, 2~3개 C, 4개 이상 또는 카드·부가세 자료가 둘 다 없으면 D
  const warnCount = checks.filter((c) => c.level === "warn").length;
  const hasCardOrVat = card.size > 0 || !!vat;
  const grade: Grade = !hasCardOrVat || warnCount >= 4 ? "D" : warnCount >= 2 ? "C" : warnCount === 1 ? "B" : "A";

  return {
    checks,
    monthly,
    claimed_vs_actual: {
      claimed_monthly_sales: claimedMonthlySales,
      verified_monthly_avg: verifiedAvg === null ? null : Math.round(verifiedAvg),
      diff_amount: diff === null ? null : Math.round(diff),
      diff_rate: diffRate,
      basis,
      level: claimedLevel,
    },
    grade,
  };
}
