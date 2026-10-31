"use client";

// 매물 비교 (PRD 9번 화면 8, F05): 최대 3개를 나란히. 객관 비교 / 내 조건 맞춤 두 관점.
// 값이 없으면 "미확인", 숫자마다 근거(출처·계산 가정)를 펼쳐 볼 수 있다.
// AI 실사로 새 정보가 들어오면 반영되도록 10초마다 새로 불러온다.

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import type { Comparison, ComparisonRow } from "@/lib/compare";
import { useCompareIds } from "@/lib/compare-selection";
import { SCORE_LABEL, type Fact, type FactTrust } from "@/lib/facts";
import { won } from "@/lib/format";
import { TRUST_LABEL } from "@/lib/labels";

const TRUST_TEXT: Record<FactTrust, string> = { ...TRUST_LABEL, computed: "코드 계산", listing: "매물 정보" };

type Line = { label: string; get: (r: ComparisonRow) => Fact<number | string> | { value: string; basis: string; trust: FactTrust }; fmt?: (v: number) => string };

const OBJECTIVE: Line[] = [
  { label: "희망 권리금", get: (r) => ({ value: r.facts.listing.premium, basis: "매물 정보 (L0 공개)", trust: "listing" }) },
  { label: "보증금", get: (r) => ({ value: r.facts.listing.deposit, basis: "매물 정보 (L0 공개)", trust: "listing" }) },
  { label: "월세", get: (r) => ({ value: r.facts.listing.monthly_rent, basis: "매물 정보 (L0 공개)", trust: "listing" }) },
  { label: "초기 투자금", get: (r) => r.facts.initial_investment },
  { label: "월평균 매출", get: (r) => r.facts.monthly_sales_avg },
  { label: "매출 변동성", get: (r) => r.facts.sales_volatility, fmt: (v) => `${v}%` },
  { label: "월평균 비용", get: (r) => r.facts.monthly_cost_avg },
  { label: "확인된 월 순수익", get: (r) => r.facts.confirmed_profit },
  { label: "점주 근무시간", get: (r) => r.facts.owner_weekly_hours, fmt: (v) => `주 ${v}시간` },
  { label: "직원 수", get: (r) => r.facts.staff_count, fmt: (v) => `${v}명` },
  { label: "임대차 남은 기간", get: (r) => r.facts.lease_remaining_months, fmt: (v) => `${v}개월` },
  { label: "관리비", get: (r) => r.facts.maintenance_fee },
  { label: "교차 검증 등급", get: (r) => r.facts.report_grade },
  { label: "주장 매출 대비 차이", get: (r) => r.facts.claimed_gap, fmt: (v) => `${v > 0 ? "+" : ""}${v}%` },
];

const PERSONAL: Line[] = [
  { label: "추가 인건비 (근무시간 차이)", get: (r) => r.fit.extra_labor_cost },
  { label: "내 조건 예상 월 순수익", get: (r) => r.fit.expected_profit },
  { label: "투자금 회수 기간", get: (r) => r.fit.payback_months, fmt: (v) => `${v}개월` },
];

export default function CompareView({ idsParam }: { idsParam: string[] }) {
  const user = useUser();
  const selected = useCompareIds();
  const ids = idsParam.length ? idsParam : selected;
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"objective" | "personal">("objective");
  const [open, setOpen] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    const load = () =>
      apiFetch<Comparison>(`/api/compare?ids=${key}`)
        .then((d) => (setData(d), setError(null)))
        .catch((e: Error) => setError(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [key, user.id]);

  if (!key) {
    return (
      <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">
        비교할 매물이 없어요.{" "}
        <Link href="/listings" className="text-accent">
          매물에서 최대 3개 고르기
        </Link>
      </p>
    );
  }
  if (error) return <p className="mx-auto max-w-6xl rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!data) return <p className="text-sm text-muted">불러오는 중...</p>;

  const rows = [...data.rows];
  const ranked = [...rows].sort((a, b) => b.recommendation.total - a.recommendation.total);

  function cell(r: ComparisonRow, line: Line) {
    const f = line.get(r);
    const id = `${r.facts.listing.id}:${line.label}`;
    const text = f.value === null ? null : typeof f.value === "number" ? (line.fmt ?? won)(f.value) : f.value;
    return (
      <td key={id} className="px-4 py-2.5 align-top">
        <button type="button" onClick={() => setOpen(open === id ? null : id)} className="w-full text-right tabular-nums">
          {text === null ? <Tag>미확인</Tag> : text}
          <span className="ml-1 text-[10px] text-accent">근거</span>
        </button>
        {open === id && (
          <p className="mt-1 rounded-md bg-bg p-2 text-left text-xs text-muted">
            {f.basis} · <b>{TRUST_TEXT[f.trust]}</b>
          </p>
        )}
      </td>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">매물 비교</h1>
          <p className="text-sm text-muted">내가 볼 수 있는 자료만으로 코드가 계산했어요. 기준이 다른 매출은 섞지 않아요.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-card p-1 text-sm">
          {(["objective", "personal"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 " + (view === v ? "bg-accent text-white" : "text-muted")}>
              {v === "objective" ? "객관적 비교" : "내 조건 맞춤"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="w-48 px-4 py-3 text-xs font-medium text-muted">항목</th>
              {rows.map((r) => (
                <th key={r.facts.listing.id} className="px-4 py-3 text-right">
                  <Link href={`/listings/${r.facts.listing.id}/report`} className="font-bold hover:text-accent">
                    {r.facts.listing.name}
                  </Link>
                  <span className="mt-1 flex justify-end gap-1">
                    {r.facts.listing.is_sample && <Tag>샘플</Tag>}
                    {r.recommendation.info_lacking && <Tag tone="caution">정보 부족</Tag>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(view === "objective" ? OBJECTIVE : PERSONAL).map((line) => (
              <tr key={line.label} className="border-t border-bg">
                <th className="px-4 py-2.5 text-left font-normal text-muted">{line.label}</th>
                {rows.map((r) => cell(r, line))}
              </tr>
            ))}
            {view === "personal" && (
              <>
                <tr className="border-t border-bg">
                  <th className="px-4 py-2.5 text-left font-normal text-muted">예산 안</th>
                  {rows.map((r) => (
                    <td key={r.facts.listing.id} className="px-4 py-2.5 text-right">
                      {r.fit.within_budget === null ? <Tag>예산 미입력</Tag> : r.fit.within_budget ? <Tag tone="outline">예산 안</Tag> : <Tag tone="warn">예산 초과</Tag>}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-bg">
                  <th className="px-4 py-2.5 text-left font-normal text-muted">목표 순수익 달성</th>
                  {rows.map((r) => (
                    <td key={r.facts.listing.id} className="px-4 py-2.5 text-right">
                      {r.fit.meets_target === null ? <Tag>미확인</Tag> : r.fit.meets_target ? <Tag tone="outline">달성</Tag> : <Tag tone="warn">미달</Tag>}
                    </td>
                  ))}
                </tr>
              </>
            )}
            <tr className="border-t border-bg align-top">
              <th className="px-4 py-2.5 text-left font-normal text-muted">위험 (심각한 순)</th>
              {rows.map((r) => (
                <td key={r.facts.listing.id} className="px-4 py-2.5 text-right text-xs">
                  {r.risks.length === 0 ? <span className="text-muted">찾은 위험 없음</span> : r.risks.slice(0, 3).map((x) => (
                    <span key={x.title} className={"mb-1 block " + (x.severity === 3 ? "text-warn" : x.severity === 2 ? "text-caution" : "text-muted")}>
                      {x.title}
                    </span>
                  ))}
                </td>
              ))}
            </tr>
            <tr className="border-t border-bg align-top">
              <th className="px-4 py-2.5 text-left font-normal text-muted">미확인</th>
              {rows.map((r) => (
                <td key={r.facts.listing.id} className="px-4 py-2.5 text-right text-xs text-muted">
                  {r.unknowns.length ? r.unknowns.join(", ") : "없음"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <section className="rounded-xl bg-card p-4">
        <p className="font-medium">추천 순위</p>
        <p className="text-xs text-muted">
          기준과 가중치: {Object.entries(data.weights).map(([k, w]) => `${SCORE_LABEL[k as keyof typeof data.weights]} ${w}점`).join(" · ")}. 모르는 항목은 점수에서 빼요 (0점 처리 안 함).
        </p>
        <ol className="mt-3 space-y-2">
          {ranked.map((r, i) => (
            <li key={r.facts.listing.id} className="rounded-lg bg-bg p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {i + 1}위 · {r.facts.listing.name}
                </span>
                <span className="font-bold tabular-nums">{r.recommendation.total}/100</span>
              </div>
              <div className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {r.recommendation.items.map((it) => (
                  <Fragment key={it.key}>
                    <span className="text-muted">
                      {SCORE_LABEL[it.key]} {it.score === null ? "정보 부족" : `${it.score}/${it.max}`} — {it.reason}
                    </span>
                  </Fragment>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
