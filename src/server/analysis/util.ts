import type { Evidence, YearMonth } from "@/types/domain";
import type { AnalysisInput } from "./types";

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 0으로 나누면 null */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** "2026-04-01" → "2026-05-01" */
export function nextMonth(ym: YearMonth): YearMonth {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** 시작~끝 월 목록 (양 끝 포함) */
export function monthRange(start: YearMonth, end: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  for (let m = start; m <= end && out.length < 600; m = nextMonth(m)) out.push(m);
  return out;
}

export function monthLabel(ym: YearMonth): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** 정규화 데이터 ID로 근거 자료를 만든다 */
export function evidenceFrom(
  input: AnalysisInput,
  source: Evidence["source"],
  description: string,
  normalizedDataId: string | null,
  yearMonth: YearMonth | null,
  value: number | null,
): Evidence {
  const doc = normalizedDataId ? input.sourceDocuments[normalizedDataId] : undefined;
  return {
    source,
    description: doc?.fileName ? `${description} (${doc.fileName})` : description,
    documentId: doc?.documentId ?? null,
    normalizedDataId,
    yearMonth,
    value,
  };
}
