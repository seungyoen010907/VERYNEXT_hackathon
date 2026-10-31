"use client";

// AI 실사 리포트 (PRD 9번 화면 9): 매물 하나를 양수인 관점에서 정리한다. 모든 숫자는 코드 계산,
// 실제 자료 값과 AI 추정값(가정 포함)을 태그로 구분한다. 교차 검증 리포트(ReportView)는 그대로 재사용한다.

import Link from "next/link";
import { useEffect, useState } from "react";
import ReportView from "@/components/ReportView";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import type { Comparison } from "@/lib/compare";
import { paybackScenarios, type Fact, type FactTrust } from "@/lib/facts";
import { won } from "@/lib/format";
import { TRUST_LABEL } from "@/lib/labels";
import type { CostCategory, DataRoom } from "@/lib/types";

const COST_NAME: Record<CostCategory, string> = { ingredients: "재료비", labor: "인건비", utilities: "공과금", rent: "임차료", fees: "수수료", other: "기타" };
const TRUST_TEXT: Record<FactTrust, string> = { ...TRUST_LABEL, computed: "코드 계산", listing: "매물 정보" };

export default function DiligenceReport({ id }: { id: string }) {
  const user = useUser();
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [room, setRoom] = useState<DataRoom | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<Comparison>(`/api/compare?ids=${id}`), apiFetch<DataRoom>(`/api/listings/${id}`)])
      .then(([c, r]) => (setCmp(c), setRoom(r), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [id, user.id]);

  if (error) return <p className="mx-auto max-w-4xl rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!cmp || !room) return <p className="text-sm text-muted">불러오는 중...</p>;

  const row = cmp.rows[0];
  const f = row.facts;
  const fit = row.fit;
  const scenarios = paybackScenarios(f, fit);
  const requests = [...new Set([...row.risks.map((r) => r.how_to_check), ...row.unknowns.map((u) => `${u} 자료 열람을 요청해요`)])].slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link href={`/listings/${id}`} className="text-sm text-muted hover:text-text">
          ← 데이터룸으로
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
          AI 실사 리포트 · {f.listing.name} {f.listing.is_sample && <Tag>샘플</Tag>}
        </h1>
        <p className="text-sm text-muted">
          {user.name}가 지금 볼 수 있는 자료(숫자 {f.visible_points}개)로 만든 리포트예요. NDA·열람 승인을 더 받으면 바뀔 수 있어요.
        </p>
      </div>

      <Box title="투자금 구성">
        <Grid>
          <Item label="희망 권리금" fact={{ value: f.listing.premium, basis: "매물 정보", trust: "listing" }} />
          <Item label="보증금" fact={{ value: f.listing.deposit, basis: "매물 정보", trust: "listing" }} />
          <Item label="초기 투자금" fact={f.initial_investment} />
          <Item label="월세" fact={{ value: f.listing.monthly_rent, basis: "매물 정보", trust: "listing" }} />
        </Grid>
      </Box>

      <Box title="매출·비용 구조">
        <Grid>
          <Item label="월평균 매출" fact={f.monthly_sales_avg} />
          <Item label="매출 변동성" fact={f.sales_volatility} fmt={(v) => `${v}%`} />
          <Item label="월평균 비용" fact={f.monthly_cost_avg} />
          <Item label="확인된 월 순수익" fact={f.confirmed_profit} />
        </Grid>
        {Object.keys(f.cost_breakdown).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(Object.entries(f.cost_breakdown) as [CostCategory, number][]).map(([k, v]) => (
              <span key={k}>
                {COST_NAME[k]} {won(v)}
              </span>
            ))}
          </div>
        )}
      </Box>

      <Box title="내 조건 기준 수익성 (AI 추정 포함)">
        <Grid>
          <Item label="점주 근무시간" fact={f.owner_weekly_hours} fmt={(v) => `주 ${v}시간`} />
          <Item label="추가 인건비" fact={fit.extra_labor_cost} />
          <Item label="예상 월 순수익" fact={fit.expected_profit} />
          <Item label="투자금 회수 기간" fact={fit.payback_months} fmt={(v) => `${v}개월`} />
        </Grid>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">회수 시나리오</th>
              <th className="py-1 text-right font-medium">월 순수익</th>
              <th className="py-1 text-right font-medium">회수 기간</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.label} className="border-t border-bg" title={s.basis}>
                <td className="py-1.5">{s.label}</td>
                <td className="py-1.5 text-right tabular-nums">{s.monthly_profit === null ? <Tag>미확인</Tag> : won(s.monthly_profit)}</td>
                <td className="py-1.5 text-right tabular-nums">{s.payback_months === null ? <Tag>미확인</Tag> : `${s.payback_months}개월`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">권리금의 &quot;정답 가격&quot;이 아니라 가정에 따른 시나리오예요. 가정: 매출 변화만큼 재료비·수수료가 같이 바뀌고, 추가 인건비는 2026년 최저시급 기준.</p>
      </Box>

      <Box title="핵심 위험 Top 3">
        {row.risks.length === 0 ? (
          <p className="text-sm text-muted">지금 자료로 찾은 위험이 없어요. 확인하지 못한 정보는 아래를 봐요.</p>
        ) : (
          <ol className="space-y-3">
            {row.risks.slice(0, 3).map((r, i) => (
              <li key={r.title} className="rounded-lg bg-bg p-3 text-sm">
                <p className="font-medium">
                  {i + 1}. {r.title} <Tag tone={r.severity === 3 ? "warn" : r.severity === 2 ? "caution" : "muted"}>{r.severity === 3 ? "높음" : r.severity === 2 ? "중간" : "확인 필요"}</Tag>
                </p>
                <p className="mt-1 text-xs text-muted">근거: {r.evidence}</p>
                <p className="text-xs text-muted">영향: {r.impact}</p>
                <p className="text-xs text-muted">확인 방법: {r.how_to_check}</p>
              </li>
            ))}
          </ol>
        )}
      </Box>

      <Box title="미확인 정보 · 양도인에게 요청할 것">
        <p className="text-sm">{row.unknowns.length ? row.unknowns.map((u) => <Tag key={u}>{u}</Tag>) : <span className="text-muted">미확인 항목이 없어요.</span>}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {requests.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Box>

      <Box title="자료 검증 (교차 검증 리포트)">
        {room.report ? (
          <ReportView report={room.report.result} />
        ) : (
          <p className="text-sm text-muted">교차 검증 리포트를 볼 권한이 없거나 아직 없어요. 데이터룸에서 NDA 동의·열람 요청을 할 수 있어요.</p>
        )}
      </Box>

      <p className="text-xs text-muted">이 리포트는 제출된 자료를 바탕으로 한 참고 자료이며, 매출 진위나 수익을 보증하지 않아요. 법률·세무 판단은 전문가 확인이 필요해요.</p>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5">
      <h2 className="mb-3 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
}

function Item({ label, fact, fmt = won }: { label: string; fact: Fact; fmt?: (v: number) => string }) {
  return (
    <div className="rounded-lg bg-bg p-3">
      <dt className="flex items-center justify-between gap-2 text-xs text-muted">
        {label}
        <Tag tone={fact.trust === "ai_estimate" ? "caution" : fact.trust === "owner_stated" ? "caution" : "muted"}>{TRUST_TEXT[fact.trust]}</Tag>
      </dt>
      <dd className="mt-1 text-lg font-bold tabular-nums">{fact.value === null ? <Tag>미확인</Tag> : fmt(fact.value)}</dd>
      <p className="mt-1 text-xs text-muted">{fact.basis}</p>
    </div>
  );
}
