"use client";

// 매물 비교 (PRD 9번 화면 8, F05): 최대 3개를 나란히. 객관 비교 / 내 조건 맞춤 두 관점.
// 값이 없으면 "미확인", 숫자마다 근거(출처·계산 가정)를 펼쳐 볼 수 있다.

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { CompareBars } from "@/components/viz/HBars";
import { apiFetch } from "@/lib/api-client";
import type { Comparison, ComparisonRow } from "@/lib/compare";
import { useCompareIds } from "@/lib/compare-selection";
import { computeAnalysis, defaultAdjust } from "@/lib/analysis";
import { analysisBase, SCORE_LABEL, type BuyerProfile, type Fact, type FactTrust } from "@/lib/facts";
import { won } from "@/lib/format";
import { TRUST_LABEL } from "@/lib/labels";

const TRUST_TEXT: Record<FactTrust, string> = { ...TRUST_LABEL, computed: "자동 계산", listing: "매물 정보" };

type Line = {
  label: string;
  get: (r: ComparisonRow, p: BuyerProfile | null) => Fact<number | string> | { value: string; basis: string; trust: FactTrust };
  fmt?: (v: number) => string;
};

// F08: 양수인 기준 계산 (조정 없이 기본값). 계산식은 lib/analysis.ts
function f08(r: ComparisonRow, p: BuyerProfile | null) {
  return computeAnalysis(analysisBase(r.facts, r.fit, p), defaultAdjust(analysisBase(r.facts, r.fit, p)));
}
const computed = (value: number | null, basis: string): Fact => ({ value, basis, trust: "computed" });

const OBJECTIVE: Line[] = [
  { label: "희망 권리금", get: (r) => ({ value: r.facts.listing.premium, basis: "매물 정보 (모두 공개)", trust: "listing" }) },
  { label: "보증금", get: (r) => ({ value: r.facts.listing.deposit, basis: "매물 정보 (모두 공개)", trust: "listing" }) },
  { label: "월세", get: (r) => ({ value: r.facts.listing.monthly_rent, basis: "매물 정보 (모두 공개)", trust: "listing" }) },
  { label: "초기 투자금", get: (r) => r.facts.initial_investment },
  { label: "월평균 매출", get: (r) => r.facts.monthly_sales_avg },
  { label: "매출 변동성", get: (r) => r.facts.sales_volatility, fmt: (v) => `${v}%` },
  { label: "월평균 비용", get: (r) => r.facts.monthly_cost_avg },
  { label: "확인된 월 순수익", get: (r) => r.facts.confirmed_profit },
  { label: "점주 근무시간", get: (r) => r.facts.owner_weekly_hours, fmt: (v) => `주 ${v}시간` },
  { label: "직원 수", get: (r) => r.facts.staff_count, fmt: (v) => `${v}명` },
  { label: "임대차 남은 기간", get: (r) => r.facts.lease_remaining_months, fmt: (v) => `${v}개월` },
  { label: "관리비", get: (r) => r.facts.maintenance_fee },
  { label: "매출 검증 등급", get: (r) => r.facts.report_grade },
  { label: "양도인 말과 자료 차이", get: (r) => r.facts.claimed_gap, fmt: (v) => `${v > 0 ? "+" : ""}${v}%` },
];

const PERSONAL: Line[] = [
  { label: "추가 인건비 (근무시간 차이)", get: (r) => r.fit.extra_labor_cost },
  { label: "내 기준 예상 월 순수익", get: (r) => r.fit.expected_profit },
  { label: "투자금 회수 기간", get: (r) => r.fit.payback_months, fmt: (v) => `${v}개월` },
  {
    label: "매출 증빙률",
    get: (r) => ({ value: r.facts.evidence.rate === null ? null : Math.round(r.facts.evidence.rate * 1000) / 10, basis: r.facts.evidence.basis, trust: "computed" }),
    fmt: (v) => `${v}%`,
  },
  { label: "내가 운영할 때 월순수익", get: (r, p) => computed(f08(r, p).net, "검증 기준 월매출 − 변동비 − 고정비(대체 인건비 포함)") },
  { label: "마진율", get: (r, p) => computed(f08(r, p).margin === null ? null : Math.round(f08(r, p).margin! * 1000) / 10, "매출총이익 ÷ 검증 기준 월매출"), fmt: (v) => `${v}%` },
  { label: "손익분기점 월매출", get: (r, p) => computed(f08(r, p).bep, "고정비 ÷ 마진율 (확인 필요 비용은 고정비로 가정)") },
  { label: "회수기간 (바닥권리금 제외)", get: (r, p) => computed(f08(r, p).payback_excl_floor.months, f08(r, p).payback_excl_floor.basis), fmt: (v) => `${v}개월` },
  { label: "회수기간 (바닥권리금 포함)", get: (r, p) => computed(f08(r, p).payback_incl_floor.months, f08(r, p).payback_incl_floor.basis), fmt: (v) => `${v}개월` },
  { label: "시설권리금 초과·근거 부족", get: (r) => computed(r.facts.facility.rows.length ? r.facts.facility.excess : null, r.facts.facility.basis) },
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
    apiFetch<Comparison>(`/api/compare?ids=${key}`)
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [key, user.id]);

  if (!key) {
    return (
      <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">
        아직 비교할 매물이 없어요.{" "}
        <Link href="/listings" className="text-accent">
          매물 담으러 가기
        </Link>
      </p>
    );
  }
  if (error) return <p className="mx-auto max-w-6xl rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!data) return <p className="text-sm text-muted">불러오는 중...</p>;

  const rows = [...data.rows];
  const ranked = [...rows].sort((a, b) => b.recommendation.total - a.recommendation.total);
  const profile = data.profile;
  const name = (r: ComparisonRow) => r.facts.listing.name;
  const glance: { title: string; hint: string; better: "high" | "low"; format: (v: number) => string; items: { name: string; value: number | null }[] }[] = [
    { title: "내 조건과 맞는 정도", hint: "점수 기준은 아래에 있어요", better: "high", format: (v) => `${v}점`, items: rows.map((r) => ({ name: name(r), value: r.recommendation.total })) },
    { title: "내가 운영할 때 월순수익", hint: "확인된 매출 − 변동비 − 고정비", better: "high", format: (v) => `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`, items: rows.map((r) => ({ name: name(r), value: f08(r, profile).net })) },
    { title: "매출 증빙률", hint: "양도인이 말한 매출 중 자료로 확인된 비율", better: "high", format: (v) => `${v}%`, items: rows.map((r) => ({ name: name(r), value: r.facts.evidence.rate === null ? null : Math.round(r.facts.evidence.rate * 1000) / 10 })) },
    { title: "손익분기점까지 여유", hint: "지금 매출이 손익분기점보다 얼마나 높은지", better: "high", format: (v) => `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`, items: rows.map((r) => ({ name: name(r), value: f08(r, profile).cushion })) },
    { title: "권리금 회수 기간", hint: "바닥권리금 포함 · 짧을수록 좋아요", better: "low", format: (v) => `${v}개월`, items: rows.map((r) => ({ name: name(r), value: f08(r, profile).payback_incl_floor.months })) },
    { title: "초기 투자금", hint: "권리금 + 보증금", better: "low", format: (v) => `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`, items: rows.map((r) => ({ name: name(r), value: r.facts.initial_investment.value })) },
  ];

  function cell(r: ComparisonRow, line: Line) {
    const f = line.get(r, data!.profile);
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
          <p className="text-sm text-muted">지금 볼 수 있는 자료로 같은 기준에서 비교해요. 가장 나은 값은 진하게 보여요.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-card p-1 text-sm">
          {(["objective", "personal"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 " + (view === v ? "bg-accent text-white" : "text-muted")}>
              {v === "objective" ? "매물 기준" : "내 조건 기준"}
            </button>
          ))}
        </div>
      </div>

      {/* 한눈에 비교: 지표마다 막대, 가장 나은 값 강조 (docs/DESIGN.md 10.5) */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="한눈에 비교">
        {glance.map((g, i) => (
          <div key={g.title} className="viz-fade rounded-xl bg-card p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="text-sm font-bold">{g.title}</p>
            <p className="mb-3 text-[11px] text-muted">{g.hint}</p>
            <CompareBars items={g.items} better={g.better} format={g.format} />
          </div>
        ))}
      </section>

      <details className="rounded-xl bg-card">
        <summary className="cursor-pointer px-4 py-3 font-bold">표로 자세히 보기</summary>
      <div className="overflow-x-auto">
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
                  <th className="px-4 py-2.5 text-left font-normal text-muted">예산</th>
                  {rows.map((r) => (
                    <td key={r.facts.listing.id} className="px-4 py-2.5 text-right">
                      {r.fit.within_budget === null ? <Tag>예산을 안 넣었어요</Tag> : r.fit.within_budget ? <Tag tone="outline">예산 안</Tag> : <Tag tone="warn">예산 초과</Tag>}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-bg">
                  <th className="px-4 py-2.5 text-left font-normal text-muted">목표 순수익</th>
                  {rows.map((r) => (
                    <td key={r.facts.listing.id} className="px-4 py-2.5 text-right">
                      {r.fit.meets_target === null ? <Tag>미확인</Tag> : r.fit.meets_target ? <Tag tone="outline">달성</Tag> : <Tag tone="warn">미달</Tag>}
                    </td>
                  ))}
                </tr>
              </>
            )}
            <tr className="border-t border-bg align-top">
              <th className="px-4 py-2.5 text-left font-normal text-muted">주의할 점</th>
              {rows.map((r) => (
                <td key={r.facts.listing.id} className="px-4 py-2.5 text-right text-xs">
                  {r.risks.length === 0 ? <span className="text-muted">찾지 못했어요</span> : r.risks.slice(0, 3).map((x) => (
                    <span key={x.title} className={"mb-1 block " + (x.severity === 3 ? "text-warn" : x.severity === 2 ? "text-caution" : "text-muted")}>
                      {x.title}
                    </span>
                  ))}
                </td>
              ))}
            </tr>
            <tr className="border-t border-bg align-top">
              <th className="px-4 py-2.5 text-left font-normal text-muted">아직 모르는 정보</th>
              {rows.map((r) => (
                <td key={r.facts.listing.id} className="px-4 py-2.5 text-right text-xs text-muted">
                  {r.unknowns.length ? r.unknowns.join(", ") : "없음"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      </details>

      <section className="rounded-xl bg-card p-4">
        <p className="font-medium">내 조건에 맞는 순서</p>
        <p className="text-xs text-muted">
          점수 기준: {Object.entries(data.weights).map(([k, w]) => `${SCORE_LABEL[k as keyof typeof data.weights]} ${w}점`).join(" · ")}. 모르는 항목은 0점이 아니라 빼고 계산해요.
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
              {/* 점수 구성 막대: 항목별 점수가 얼마나 채워졌는지 */}
              <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={r.recommendation.items.map((it) => `${SCORE_LABEL[it.key]} ${it.score ?? "정보 부족"}/${it.max}`).join(", ")}>
                {r.recommendation.items.map((it, j) => (
                  <span key={it.key} className="relative h-full bg-border" style={{ width: `${it.max}%` }} title={`${SCORE_LABEL[it.key]} ${it.score ?? "정보 부족"}/${it.max}`}>
                    {it.score !== null && <span className="viz-grow-x absolute inset-y-0 left-0 bg-accent" style={{ width: `${(it.score / it.max) * 100}%`, animationDelay: `${j * 60}ms` }} />}
                  </span>
                ))}
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
