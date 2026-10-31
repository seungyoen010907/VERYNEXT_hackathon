"use client";

// 매물 인수 판단 (PRD F08, docs/DESIGN.md 10.5 실사 리포트).
// 그래프가 먼저, 표·근거는 펼쳐서. 오른쪽 "조건 바꿔보기"를 바꾸면 lib/analysis.ts computeAnalysis를 브라우저에서 다시 불러
// 그래프가 바로 바뀐다 (저장하지 않음). 낸 자료 기준의 실사 보조 계산이며 매출·권리금 적정가를 보증하지 않는다.

import { useState } from "react";
import Tag from "@/components/Tag";
import CountUp from "@/components/viz/CountUp";
import Gauge from "@/components/viz/Gauge";
import { BepBar, PaybackTimeline, RangeBars, type RangeRow } from "@/components/viz/HBars";
import MonthlyBars from "@/components/viz/MonthlyBars";
import Waterfall from "@/components/viz/Waterfall";
import {
  absentOwnerLabor,
  computeAnalysis,
  defaultAdjust,
  EVIDENCE_LABEL,
  FACILITY_VERDICT_LABEL,
  type AnalysisAdjust,
  type AnalysisBase,
  type SalesEvidence,
} from "@/lib/analysis";
import { COST_KIND_LABEL } from "@/lib/costs";
import { won } from "@/lib/format";

const SALES_STEPS = [-0.15, 0, 0.1];
const pct = (r: number | null) => (r === null ? "미확인" : `${(Math.round(r * 1000) / 10).toFixed(1)}%`);
const man = (n: number) => `${Math.round(n / 10_000).toLocaleString("ko-KR")}만 원`;

export default function AcquisitionAnalysis({ base, evidence }: { base: AnalysisBase; evidence: SalesEvidence }) {
  const [adj, setAdj] = useState<AnalysisAdjust>(() => defaultAdjust(base));
  const a = computeAnalysis(base, adj);
  const dflt = computeAnalysis(base, defaultAdjust(base));
  const changed = JSON.stringify(adj) !== JSON.stringify(defaultAdjust(base));
  const set = (patch: Partial<AnalysisAdjust>) => setAdj((prev) => ({ ...prev, ...patch }));
  const absent = absentOwnerLabor(base);
  const canProfit = a.sales !== null && base.lines.length > 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-4">
        {/* 결론 카드 4칸 */}
        <section className="viz-fade rounded-xl bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">인수해도 될까요?</h2>
            {changed && <Tag tone="caution">바꾼 조건으로 계산 중</Tag>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="확인된 월매출" value={a.sales} sub={evidence.level ? `증빙 ${EVIDENCE_LABEL[evidence.level]}` : "아직 자료끼리 확인 전이에요"} />
            <Stat label="내가 운영할 때 월순수익" value={a.net} sub={`월수익률 ${pct(a.monthly_return)}`} warn={a.net !== null && a.net <= 0} />
            <Stat label="손익분기점 월매출" value={a.bep} sub={a.cushion === null ? "여유 미확인" : `${a.cushion >= 0 ? "여유" : "부족"} ${man(Math.abs(a.cushion))}`} warn={a.cushion !== null && a.cushion < 0} />
            <div className="rounded-lg bg-bg p-3">
              <p className="text-xs text-muted">권리금 회수 기간</p>
              <p className={"mt-1 text-lg font-bold tabular-nums " + (a.vs_target !== null && a.vs_target > 0 ? "text-warn" : "")}>
                {a.payback_incl_floor.months === null ? "계산할 수 없어요" : `${a.payback_incl_floor.months}개월`}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {a.vs_target === null ? (adj.target_payback ? "목표와 비교할 수 없어요" : "목표 기간을 넣어 주세요") : a.vs_target > 0 ? `목표보다 ${a.vs_target}개월 길어요` : `목표보다 ${Math.abs(a.vs_target)}개월 빨라요`}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">양도인이 낸 자료로 계산했어요. 매출이 사실인지, 권리금이 적정한지를 보증하지는 않아요.</p>
        </section>

        {/* 1. 매출 증빙 */}
        <Panel no="1" title="양도인이 말한 매출, 자료로 얼마나 확인될까요?">
          {evidence.claimed === null ? (
            <p className="text-sm text-muted">매출 검증 결과를 아직 볼 수 없어요. 자료실에서 NDA에 동의하면 볼 수 있어요.</p>
          ) : (
            <div className="grid items-center gap-5 sm:grid-cols-[11rem_1fr]">
              <div className="flex flex-col items-center">
                <Gauge
                  value={evidence.rate}
                  marks={[0.7, 0.9]}
                  label={pct(evidence.rate)}
                  sub={evidence.level ? `증빙 ${EVIDENCE_LABEL[evidence.level]}` : "미확인"}
                  tone={evidence.level === "low" ? "warn" : evidence.level === "medium" ? "caution" : "accent"}
                />
                <dl className="mt-2 w-full space-y-0.5 text-xs">
                  <Kv k="양도인이 말한 매출" v={won(evidence.claimed)} />
                  <Kv k="자료로 확인됨" v={won(evidence.verified)} strong />
                  <Kv k="아직 확인 안 됨" v={won(evidence.unverified)} warn={!!evidence.unverified} />
                </dl>
              </div>
              <div className="min-w-0">
                <MonthlyBars rows={evidence.months.map((m) => ({ month: m.month, bar: m.card_delivery, dot: m.pos, flagged: m.flagged, confirmed: m.confirmed }))} claimed={evidence.claimed} />
              </div>
            </div>
          )}
          {evidence.warnings.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {evidence.warnings.map((w) => (
                <li key={w} className="rounded-full bg-warn/10 px-2.5 py-1 text-xs text-warn">
                  {w}
                </li>
              ))}
            </ul>
          )}
          <Details summary="어떻게 계산했나요?">
            <p>{evidence.basis}</p>
            <p>90% 이상이면 높음, 70% 이상이면 보통, 그 아래는 낮음이에요. 카드 입금액은 수수료와 입금 날짜 차이가 있어 POS와 비교하지 않아요.</p>
            {evidence.excluded.length > 0 && <p>확인에서 뺀 달: {evidence.excluded.map((e) => `${e.month} (${e.reason})`).join(" / ")}</p>}
          </Details>
        </Panel>

        {/* 2. 양수인 기준 이익 */}
        <Panel no="2" title="내가 운영하면 월 얼마가 남을까요?">
          {!canProfit ? (
            <p className="text-sm text-muted">{a.sales === null ? "매출 자료를 볼 수 없어 아직 계산할 수 없어요." : "비용 자료를 볼 수 없어 아직 계산할 수 없어요. 자료실에서 NDA에 동의하거나 열람을 요청해 보세요."}</p>
          ) : (
            <>
              <Waterfall
                steps={[
                  { label: "매출", value: a.sales!, kind: "total" },
                  { label: "변동비", value: a.variable, kind: "minus" },
                  { label: "남는 돈", value: a.gross!, kind: "total" },
                  { label: "고정비", value: a.fixed, kind: "minus" },
                  { label: "월순수익", value: a.net!, kind: "total" },
                ]}
              />
              <p className="mt-1 text-center text-sm">
                마진율 <b className="tabular-nums">{pct(a.margin)}</b> · 총 투입자금 {won(a.invest)} 대비 월수익률 <b className="tabular-nums">{pct(a.monthly_return)}</b>
              </p>
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">손익분기점</p>
                <BepBar sales={a.sales} bep={a.bep} />
              </div>
              <Details summary="비용 항목 보기">
                <table className="w-full">
                  <tbody>
                    {base.lines.map((l) => (
                      <tr key={`${l.name}-${l.source}`} className="border-t border-bg">
                        <td className="py-1">{l.name}</td>
                        <td className="py-1">
                          <Tag tone={l.kind === "unknown" ? "caution" : "muted"}>
                            {COST_KIND_LABEL[l.kind]}
                            {l.kind === "unknown" ? " · 고정비로 계산" : ""}
                          </Tag>
                        </td>
                        <td className="py-1 text-right tabular-nums">{won(l.amount)}</td>
                        <td className="py-1 pl-2">{l.note}</td>
                      </tr>
                    ))}
                    {adj.replacement_labor > 0 && (
                      <tr className="border-t border-bg">
                        <td className="py-1">대체 인건비</td>
                        <td className="py-1">
                          <Tag>고정비 · 추정</Tag>
                        </td>
                        <td className="py-1 text-right tabular-nums">{won(adj.replacement_labor)}</td>
                        <td className="py-1 pl-2">2026년 최저시급 기준</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="mt-2">매출 기준: {base.sales_basis}</p>
              </Details>
            </>
          )}
        </Panel>

        {/* 3. 회수기간 */}
        <Panel no="3" title="권리금, 몇 개월이면 돌려받을까요?">
          <PaybackTimeline
            target={adj.target_payback}
            rows={[
              { label: "바닥권리금 빼고 (영업·시설만)", months: a.payback_excl_floor.months, note: a.payback_excl_floor.basis },
              { label: "바닥권리금 포함 (실제로 내는 돈)", months: a.payback_incl_floor.months, note: a.payback_incl_floor.basis },
            ]}
          />
          {base.premium.floor ? (
            <p className="mt-1 rounded-lg bg-bg p-3 text-sm">
              바닥권리금 {won(base.premium.floor)} 때문에 <b>{a.floor_burden.months ?? "?"}개월</b>이 더 걸려요. 그만큼 자리가 좋은지, 임대차가 안정적인지 확인해 보세요.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">양도인이 바닥권리금을 따로 나누지 않아서 두 기간이 같아요.</p>
          )}
          <PremiumStrip base={base} premium={adj.premium} />
        </Panel>

        {/* 4. 시설권리금 */}
        <Panel no="4" title="시설권리금, 근거가 있을까요?" badge="AI 추정 · 참고 범위">
          {base.facility.rows.length === 0 ? (
            <p className="text-sm text-muted">{base.facility.basis}</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="양도인이 말한 금액" value={base.facility.claimed === null ? "미분류" : man(base.facility.claimed)} />
                <Mini label="추정 중고 가치" value={man(base.facility.value)} />
                <Mini label="근거가 부족한 금액" value={base.facility.excess === null ? "-" : man(base.facility.excess)} warn={!!base.facility.excess} />
              </div>
              <RangeBars
                rows={base.facility.rows.map(
                  (r): RangeRow => ({
                    label: `${r.name}${r.qty > 1 ? ` ×${r.qty}` : ""}`,
                    low: r.low,
                    high: r.high,
                    point: r.claimed,
                    tag: FACILITY_VERDICT_LABEL[r.verdict],
                    tone: r.verdict === "ok" ? "ok" : r.verdict === "over" || r.verdict === "excluded" ? "warn" : "muted",
                  }),
                )}
              />
              <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-5 rounded-full bg-accent/30" /> AI 추정 범위
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full bg-muted" /> 양도인 반영가
                </span>
              </p>
              <Details summary="어떻게 추정했나요?">
                <p>{base.facility.basis}. 실제 중고 시세를 조회한 게 아니라 AI가 사용 연수로 추정한 값이에요. 같은 모델의 중고 매물을 직접 찾아보세요.</p>
              </Details>
            </>
          )}
        </Panel>

        {a.assumptions.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
            {a.assumptions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 조건 바꿔보기 (데스크톱: 오른쪽 고정) */}
      <aside className="viz-fade space-y-4 rounded-xl bg-card p-5 lg:sticky lg:top-4" style={{ animationDelay: "120ms" }} aria-label="조건 바꿔보기">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">조건 바꿔보기</h2>
          <button type="button" onClick={() => setAdj(defaultAdjust(base))} disabled={!changed} className="text-xs text-accent disabled:text-muted">
            되돌리기
          </button>
        </div>
        <Field label="권리금을 깎는다면">
          <input
            type="range"
            min={Math.round(base.premium.total * 0.5)}
            max={base.premium.total}
            step={1_000_000}
            value={adj.premium}
            onChange={(e) => set({ premium: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
            aria-label="권리금 금액"
          />
          <div className="flex justify-between text-xs">
            <span className="font-bold tabular-nums">{won(adj.premium)}</span>
            {adj.premium !== base.premium.total && <span className="text-accent">−{man(base.premium.total - adj.premium)}</span>}
          </div>
          {adj.premium !== base.premium.total && (
            <p className="mt-1 text-xs text-muted">
              회수 {dflt.payback_incl_floor.months ?? "?"} → <b className="text-text">{a.payback_incl_floor.months ?? "?"}개월</b>
            </p>
          )}
        </Field>
        <Field label="매출 변화">
          <Segmented options={SALES_STEPS.map((s) => ({ value: s, label: s === 0 ? "기준" : `${s > 0 ? "+" : ""}${Math.round(s * 100)}%` }))} value={adj.sales_change} onChange={(v) => set({ sales_change: v })} />
        </Field>
        <Field label="누가 운영하나요?">
          <Segmented
            options={[
              { value: true, label: "직접" },
              { value: false, label: "직원에게 맡김" },
            ]}
            value={adj.owner_operates}
            onChange={(v) => set({ owner_operates: v, replacement_labor: v ? base.default_replacement_labor : (absent ?? adj.replacement_labor) })}
          />
        </Field>
        <Field label="추가 인건비 (월)">
          <MoneyInput value={adj.replacement_labor} onChange={(v) => set({ replacement_labor: v })} />
          {!adj.owner_operates && absent === null && <p className="mt-1 text-[11px] text-muted">지금 점주의 근무시간을 몰라요. 금액을 직접 넣어 주세요.</p>}
        </Field>
        <Field label="인수 후 추가 수리비">
          <MoneyInput value={adj.extra_capex} onChange={(v) => set({ extra_capex: v })} />
        </Field>
        <Field label="목표 회수 기간">
          <Segmented
            options={[
              { value: 24, label: "24개월" },
              { value: 36, label: "36개월" },
            ]}
            value={adj.target_payback ?? 0}
            onChange={(v) => set({ target_payback: v })}
          />
        </Field>
        <p className="text-[11px] text-muted">바꾸면 바로 다시 계산해요. 저장되지는 않아요.</p>
      </aside>
    </div>
  );
}

// 권리금 구성 띠: 영업·시설·바닥·미분류 비율
function PremiumStrip({ base, premium }: { base: AnalysisBase; premium: number }) {
  const p = base.premium;
  const parts = [
    { label: "영업", value: p.business, cls: "bg-accent" },
    { label: "시설", value: p.facility, cls: "bg-accent/55" },
    { label: "바닥", value: p.floor, cls: "bg-caution/70" },
    { label: "미분류", value: p.unclassified || null, cls: "bg-muted/40" },
  ].filter((x): x is { label: string; value: number; cls: string } => !!x.value);
  if (parts.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs text-muted">
        권리금 {won(p.total)} 나눠 보기{premium !== p.total ? ` (바꾼 금액 ${won(premium)})` : ""}
      </p>
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={parts.map((x) => `${x.label} ${won(x.value)}`).join(", ")}>
        {parts.map((x) => (
          <span key={x.label} className={"viz-grow-x h-full " + x.cls} style={{ width: `${(x.value / p.total) * 100}%` }} />
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        {parts.map((x) => (
          <span key={x.label} className="flex items-center gap-1">
            <span className={"inline-block size-2 rounded-sm " + x.cls} /> {x.label} {man(x.value)}
          </span>
        ))}
      </p>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: number | null; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-bg p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={"mt-1 text-lg font-bold " + (warn ? "text-warn" : "")}>{value === null ? <span className="text-muted">미확인</span> : <CountUp value={value} format={won} />}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-bg p-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={"text-sm font-bold tabular-nums " + (warn ? "text-warn" : "")}>{value}</p>
    </div>
  );
}

function Kv({ k, v, strong, warn }: { k: string; v: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className={"tabular-nums " + (strong ? "font-bold" : "") + (warn ? " text-warn" : "")}>{v}</dd>
    </div>
  );
}

function Panel({ no, title, badge, children }: { no: string; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="viz-fade rounded-xl bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">{no}</span>
        <h2 className="font-bold">{title}</h2>
        {badge && <Tag tone="caution">{badge}</Tag>}
      </div>
      {children}
    </section>
  );
}

function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 text-xs text-muted">
      <summary className="cursor-pointer text-accent">{summary}</summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string | number | boolean>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-bg p-0.5" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={"flex-1 rounded-md px-2 py-1 text-sm transition-colors " + (value === o.value ? "bg-card font-medium text-text" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <>
      <input
        value={value ? String(value) : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
        inputMode="numeric"
        placeholder="0"
        className="w-full rounded-lg bg-bg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent/30"
      />
      <span className="mt-0.5 block text-[11px] text-muted">{won(value)}</span>
    </>
  );
}
