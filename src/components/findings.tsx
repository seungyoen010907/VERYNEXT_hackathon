/**
 * 분석 결과 표시 형식
 * 모든 분석 화면은 숫자만 보여주지 않고 아래 다섯 항목을 같은 순서로 보여준다.
 *   분석 결과 · 판단 근거 · 관련 증빙 자료 · 미확인 항목 · 추가로 필요한 조치
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Evidence } from "@/types/domain";
import { won, ym } from "@/lib/format";

export function EvidenceList({ evidence, storeId, max = 8 }: { evidence: Evidence[]; storeId?: string; max?: number }) {
  if (evidence.length === 0) return <span className="text-neutral-500">연결된 증빙 없음</span>;
  const shown = evidence.slice(0, max);
  return (
    <ul className="space-y-0.5">
      {shown.map((e, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="text-neutral-800">{e.description}</span>
          {e.documentId && storeId && (
            <Link href={`/stores/${storeId}?tab=documents#doc-${e.documentId}`} className="text-[11px] text-blue-800 underline underline-offset-2">
              자료 보기
            </Link>
          )}
        </li>
      ))}
      {evidence.length > max && <li className="text-[11px] text-neutral-500">외 {evidence.length - max}건</li>}
    </ul>
  );
}

export interface FindingsProps {
  result: ReactNode;
  basis: ReactNode;
  evidence?: ReactNode;
  unverified?: ReactNode[];
  actions?: ReactNode[];
}

export function Findings({ result, basis, evidence, unverified = [], actions = [] }: FindingsProps) {
  const rows: Array<[string, ReactNode]> = [
    ["분석 결과", result],
    ["판단 근거", basis],
    ["관련 증빙 자료", evidence ?? <span className="text-neutral-500">—</span>],
    [
      "미확인 항목",
      unverified.length ? (
        <ul className="list-disc space-y-0.5 pl-4">{unverified.map((u, i) => <li key={i}>{u}</li>)}</ul>
      ) : (
        <span className="text-neutral-500">없음</span>
      ),
    ],
    [
      "추가로 필요한 조치",
      actions.length ? (
        <ul className="list-disc space-y-0.5 pl-4">{actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
      ) : (
        <span className="text-neutral-500">없음</span>
      ),
    ],
  ];
  return (
    <dl className="divide-y divide-neutral-100 rounded-sm border border-neutral-200">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-2.5 md:grid-cols-[140px_1fr]">
          <dt className="text-[12px] font-medium text-neutral-500">{k}</dt>
          <dd className="text-[13px] leading-relaxed text-neutral-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Amount({ value, strong, negativeRed = true }: { value: number | null | undefined; strong?: boolean; negativeRed?: boolean }) {
  const neg = typeof value === "number" && value < 0;
  return (
    <span className={`${strong ? "font-semibold" : ""} ${neg && negativeRed ? "text-red-700" : ""} ${value === null || value === undefined ? "text-neutral-400" : ""}`}>
      {value === null || value === undefined ? "미확인" : won(value)}
    </span>
  );
}

export function MonthCell({ v }: { v: string | null }) {
  return <span className="whitespace-nowrap">{v ? ym(v) : "전체"}</span>;
}
