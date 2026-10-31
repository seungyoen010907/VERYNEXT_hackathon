"use client";

// AI 실사 리포트 (PRD 9번 화면 9): 매물 하나를 양수인 관점에서 정리한다. 모든 숫자는 코드 계산,
// 실제 자료 값과 AI 추정값(가정 포함)을 태그로 구분한다. 교차 검증 리포트(ReportView)는 그대로 재사용한다.

import Link from "next/link";
import { useEffect, useState } from "react";
import AcquisitionAnalysis from "@/components/AcquisitionAnalysis";
import AgentIcon from "@/components/viz/AgentIcon";
import ReportView from "@/components/ReportView";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { AGENTS } from "@/lib/agent-registry";
import { apiFetch } from "@/lib/api-client";
import type { Comparison } from "@/lib/compare";
import { analysisBase, type Fact, type FactTrust } from "@/lib/facts";
import { won } from "@/lib/format";
import { TRUST_LABEL } from "@/lib/labels";
import type { CostCategory, DataRoom } from "@/lib/types";

const COST_NAME: Record<CostCategory, string> = { ingredients: "재료비", labor: "인건비", utilities: "공과금", rent: "임차료", fees: "수수료", other: "기타" };
const TRUST_TEXT: Record<FactTrust, string> = { ...TRUST_LABEL, computed: "자동 계산", listing: "매물 정보" };

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
  const requests = [...new Set([...row.risks.map((r) => r.how_to_check), ...row.unknowns.map((u) => `${u} 자료를 보여 달라고 요청해요`)])].slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="viz-fade flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/listings/${id}`} className="text-sm text-muted hover:text-text">
            ← 자료실로
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
            실사 리포트 · {f.listing.name} {f.listing.is_sample && <Tag>샘플</Tag>}
          </h1>
          <p className="text-sm text-muted">
            지금 볼 수 있는 숫자 {f.visible_points}개로 만들었어요. NDA에 동의하거나 열람을 승인받으면 더 정확해져요.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs text-muted" title={AGENTS.diligence.does}>
          <AgentIcon agent="diligence" className="size-4 text-accent" />
          {AGENTS.diligence.name}가 정리했어요 · 숫자는 자동 계산
        </span>
      </div>

      <AcquisitionAnalysis key={`${user.id}:${id}`} base={analysisBase(f, fit, cmp.profile)} evidence={f.evidence} />

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Box title="꼭 확인할 점 3가지">
          {row.risks.length === 0 ? (
            <p className="text-sm text-muted">지금 자료로는 눈에 띄는 위험이 없어요. 아직 모르는 정보는 오른쪽을 보세요.</p>
          ) : (
            <ol className="space-y-2">
              {row.risks.slice(0, 3).map((r, i) => (
                <li
                  key={r.title}
                  className={"viz-fade rounded-lg border-l-4 bg-bg p-3 text-sm " + (r.severity === 3 ? "border-warn" : r.severity === 2 ? "border-caution" : "border-border")}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <p className="font-medium">
                    {i + 1}. {r.title}
                  </p>
                  <p className="mt-1 text-xs text-muted">{r.evidence}</p>
                  <p className="text-xs text-muted">
                    {r.impact} → {r.how_to_check}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {row.risks.length > 3 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-accent">{row.risks.length - 3}개 더 보기</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
                {row.risks.slice(3).map((r) => (
                  <li key={r.title}>{r.title}</li>
                ))}
              </ul>
            </details>
          )}
        </Box>

        <Box title="양도인에게 물어볼 것">
          <div className="flex flex-wrap gap-1">{row.unknowns.length ? row.unknowns.map((u) => <Tag key={u}>모름 · {u}</Tag>) : <span className="text-sm text-muted">모르는 정보가 없어요.</span>}</div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {requests.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <Link href={`/deals/${id}`} className="mt-3 inline-block text-sm text-accent">
            거래방에서 물어보기 →
          </Link>
        </Box>
      </div>

      <details className="rounded-xl bg-card p-5">
        <summary className="cursor-pointer font-bold">숫자 근거 모두 보기</summary>
        <div className="mt-4 space-y-4">
          <Grid>
            <Item label="희망 권리금" fact={{ value: f.listing.premium, basis: "매물 정보", trust: "listing" }} />
            <Item label="보증금" fact={{ value: f.listing.deposit, basis: "매물 정보", trust: "listing" }} />
            <Item label="월평균 매출 (자료상)" fact={f.monthly_sales_avg} />
            <Item label="매출 변동성" fact={f.sales_volatility} fmt={(v) => `${v}%`} />
            <Item label="월평균 비용" fact={f.monthly_cost_avg} />
            <Item label="점주 근무시간" fact={f.owner_weekly_hours} fmt={(v) => `주 ${v}시간`} />
            <Item label="추가 인건비 (근무시간 차이)" fact={fit.extra_labor_cost} />
            <Item label="임대차 남은 기간" fact={f.lease_remaining_months} fmt={(v) => `${v}개월`} />
          </Grid>
          {Object.keys(f.cost_breakdown).length > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {(Object.entries(f.cost_breakdown) as [CostCategory, number][]).map(([k, v]) => (
                <span key={k}>
                  {COST_NAME[k]} {won(v)}
                </span>
              ))}
            </p>
          )}
        </div>
      </details>

      <details className="rounded-xl bg-card p-5">
        <summary className="cursor-pointer font-bold">매출 검증 자세히 보기</summary>
        <div className="mt-4">
          {room.report ? (
            <ReportView report={room.report.result} />
          ) : (
            <p className="text-sm text-muted">매출 검증 결과를 아직 볼 수 없어요. 자료실에서 NDA에 동의하거나 열람을 요청해 보세요.</p>
          )}
        </div>
      </details>

      <p className="text-xs text-muted">이 리포트는 양도인이 낸 자료로 만든 참고 자료예요. 매출이나 수익을 보증하지 않으니, 법률·세무 판단은 전문가에게 확인해 주세요.</p>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5">
      <h2 className="mb-3 font-bold">{title}</h2>
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
