"use client";

// 매물 인수 판단 (PRD F08): 매출 증빙 → 양수인 기준 월 예상 이익 → 시설권리금 → 권리금 회수기간.
// 조정값을 바꾸면 lib/analysis.ts computeAnalysis를 브라우저에서 다시 불러 바로 갱신한다 (저장하지 않음).
// 이 화면은 매출의 진실성이나 권리금 적정가를 보증하지 않는다. 낸 자료 기준의 실사 보조 계산이다.

import { useState } from "react";
import Tag from "@/components/Tag";
import {
  absentOwnerLabor,
  computeAnalysis,
  defaultAdjust,
  EVIDENCE_LABEL,
  FACILITY_VERDICT_LABEL,
  type AnalysisAdjust,
  type AnalysisBase,
  type Payback,
  type SalesEvidence,
} from "@/lib/analysis";
import { COST_KIND_LABEL } from "@/lib/costs";
import type { Risk } from "@/lib/facts";
import { won } from "@/lib/format";

const SALES_STEPS = [-0.15, 0, 0.1];
const pct = (r: number | null, digits = 1) => (r === null ? null : `${(Math.round(r * 10 ** (digits + 2)) / 10 ** digits).toFixed(digits)}%`);
const months = (p: Payback) => (p.months === null ? null : `${p.months}개월`);

export default function AcquisitionAnalysis({ base, evidence, risks }: { base: AnalysisBase; evidence: SalesEvidence; risks: Risk[] }) {
  const [adj, setAdj] = useState<AnalysisAdjust>(() => defaultAdjust(base));
  const a = computeAnalysis(base, adj);
  const dflt = computeAnalysis(base, defaultAdjust(base));
  const changed = JSON.stringify(adj) !== JSON.stringify(defaultAdjust(base));
  const set = (patch: Partial<AnalysisAdjust>) => setAdj((prev) => ({ ...prev, ...patch }));
  const absent = absentOwnerLabor(base);

  return (
    <div className="space-y-4">
      {/* 매물 인수 판단 카드 */}
      <section className="rounded-xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">매물 인수 판단</h2>
          {changed && <Tag tone="caution">조정값 반영 중</Tag>}
        </div>
        <p className="mt-1 text-xs text-muted">
          낸 자료 기준의 계산이에요. 매출의 진실성이나 권리금 적정가를 보증하지 않아요. 확인됨 / 추가 확인 필요 / 증빙 부족을 보여주는 실사 보조 도구예요.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="검증 기준 월매출" value={won(a.sales)} sub={evidence.level ? `매출 증빙 수준: ${EVIDENCE_LABEL[evidence.level]}` : "교차 확인 전 (자료상 평균)"} />
          <Stat label="양수인 기준 월순수익" value={won(a.net)} sub={a.monthly_return === null ? "월수익률 미확인" : `월수익률 ${pct(a.monthly_return)}`} warn={a.net !== null && a.net <= 0} />
          <Stat label="손익분기점 월매출" value={won(a.bep)} sub={a.cushion === null ? "여유 미확인" : `현재 매출 대비 ${a.cushion >= 0 ? "여유" : "부족"} ${won(Math.abs(a.cushion))}`} warn={a.cushion !== null && a.cushion < 0} />
          <Stat
            label="권리금 회수기간"
            value={months(a.payback_incl_floor) ?? "회수 불가·미확인"}
            sub={`바닥권리금 제외 ${months(a.payback_excl_floor) ?? "미확인"} · 포함 ${months(a.payback_incl_floor) ?? "미확인"}`}
            warn={a.vs_target !== null && a.vs_target > 0}
          />
        </div>
        {adj.target_payback ? (
          <p className="mt-3 text-sm">
            내 목표 회수기간 {adj.target_payback}개월 →{" "}
            {a.vs_target === null ? (
              <span className="text-muted">회수기간을 계산할 수 없어요</span>
            ) : a.vs_target > 0 ? (
              <span className="font-medium text-warn">바닥권리금 포함 시 목표보다 {a.vs_target}개월 초과</span>
            ) : (
              <span className="font-medium text-accent">목표 안 ({Math.abs(a.vs_target)}개월 여유)</span>
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">인수 조건에 목표 회수기간을 넣으면 목표 대비 초과·여유를 보여줘요.</p>
        )}
        {risks.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium">주요 위험</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {risks.slice(0, 5).map((r) => (
                <li key={r.title}>{r.title}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 조정 */}
      <section className="rounded-xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">조건 바꿔보기</h2>
          <button type="button" onClick={() => setAdj(defaultAdjust(base))} disabled={!changed} className="text-sm text-accent disabled:text-muted">
            처음 값으로
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">바꾸면 바로 다시 계산해요. 저장하지 않아요.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={`권리금 협상 금액 (요구 ${won(base.premium.total)})`}>
            <MoneyInput value={adj.premium} onChange={(v) => set({ premium: v })} />
            {adj.premium !== base.premium.total && (
              <span className="mt-1 block text-xs text-muted">
                바닥권리금 포함 회수기간 {months(dflt.payback_incl_floor) ?? "미확인"} → {months(a.payback_incl_floor) ?? "미확인"}
              </span>
            )}
          </Field>
          <Field label="매출 변화">
            <div className="flex gap-1">
              {SALES_STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set({ sales_change: s })}
                  aria-pressed={adj.sales_change === s}
                  className={"flex-1 rounded-lg px-2 py-1.5 text-sm " + (adj.sales_change === s ? "bg-accent text-white" : "bg-bg text-muted")}
                >
                  {s === 0 ? "기준" : `${s > 0 ? "+" : ""}${Math.round(s * 100)}%`}
                </button>
              ))}
            </div>
          </Field>
          <Field label="목표 회수기간">
            <div className="flex gap-1">
              {[24, 36].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ target_payback: m })}
                  aria-pressed={adj.target_payback === m}
                  className={"flex-1 rounded-lg px-2 py-1.5 text-sm " + (adj.target_payback === m ? "bg-accent text-white" : "bg-bg text-muted")}
                >
                  {m}개월
                </button>
              ))}
            </div>
          </Field>
          <Field label="점주 직접 운영">
            <div className="flex gap-1">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set({ owner_operates: v, replacement_labor: v ? base.default_replacement_labor : (absent ?? adj.replacement_labor) })}
                  aria-pressed={adj.owner_operates === v}
                  className={"flex-1 rounded-lg px-2 py-1.5 text-sm " + (adj.owner_operates === v ? "bg-accent text-white" : "bg-bg text-muted")}
                >
                  {v ? "직접 운영" : "직원에게 맡김"}
                </button>
              ))}
            </div>
            {!adj.owner_operates && absent === null && <span className="mt-1 block text-xs text-muted">점주 근무시간을 몰라서 대체 인건비를 직접 넣어주세요.</span>}
          </Field>
          <Field label="점주 대체 인건비 (월)">
            <MoneyInput value={adj.replacement_labor} onChange={(v) => set({ replacement_labor: v })} />
            <span className="mt-1 block text-xs text-muted">고정비에 더해요. 기본값은 2026년 최저시급 기준 계산이에요.</span>
          </Field>
          <Field label="인수 후 추가 시설·수리비">
            <MoneyInput value={adj.extra_capex} onChange={(v) => set({ extra_capex: v })} />
            <span className="mt-1 block text-xs text-muted">총 투입자금에만 더해요.</span>
          </Field>
        </div>
      </section>

      {/* 1. 매출 증빙 */}
      <Box title="매출 증빙">
        {evidence.claimed === null ? (
          <p className="text-sm text-muted">{evidence.basis}. 검증 리포트 열람을 요청하면 증빙률을 볼 수 있어요.</p>
        ) : (
          <>
            <Rows
              rows={[
                ["양도인 주장 월평균 매출", won(evidence.claimed)],
                ["자료상 교차 확인된 매출", evidence.verified === null ? "미확인" : won(evidence.verified)],
                ["추가 증빙 필요 매출", evidence.unverified === null ? "미확인" : won(evidence.unverified)],
                ["매출 증빙률", evidence.rate === null ? "미확인" : `${pct(evidence.rate)} · 수준 ${evidence.level ? EVIDENCE_LABEL[evidence.level] : "미확인"}`],
              ]}
            />
            <p className="mt-2 text-xs text-muted">{evidence.basis} 증빙 수준 기준: 90% 이상 높음, 70% 이상 보통, 그 아래 낮음.</p>
            {evidence.excluded.length > 0 && (
              <p className="mt-1 text-xs text-muted">교차 확인에서 뺀 달: {evidence.excluded.map((e) => `${e.month} (${e.reason})`).join(" / ")}</p>
            )}
            {evidence.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-warn">
                {evidence.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </Box>

      {/* 2. 양수인 기준 월 예상 이익 */}
      <Box title="양수인 기준 월 예상 이익">
        {a.sales === null || base.lines.length === 0 ? (
          <p className="text-sm text-muted">{a.sales === null ? "볼 수 있는 매출 자료가 없어 계산할 수 없어요." : "볼 수 있는 비용 자료가 없어 계산할 수 없어요. 비용 열람을 요청해요."}</p>
        ) : (
          <>
            <Rows
              rows={[
                ["검증 기준 월매출", won(a.sales)],
                ["변동비 합계", `− ${won(a.variable)}`],
                ["매출총이익", won(a.gross), true],
                ["마진율", pct(a.margin) ?? "미확인"],
                ["고정비 합계", `− ${won(a.fixed)}`],
                ["양수인 기준 월순수익", won(a.net), true],
                ["총 투입자금", `${won(a.invest)} (보증금 + 권리금${adj.extra_capex ? " + 추가 시설·수리비" : ""})`],
                ["월수익률", pct(a.monthly_return) ?? "미확인"],
                ["손익분기점 월매출", a.bep === null ? "미확인 (마진율 0 이하)" : `${won(a.bep)} (고정비 ÷ 마진율)`],
                ["현재 월매출 대비 여유", a.cushion === null ? "미확인" : won(a.cushion)],
              ]}
            />
            <p className="mt-2 text-xs text-muted">매출 기준: {base.sales_basis}</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-accent">비용 항목과 분류 보기</summary>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {base.lines.map((l) => (
                    <tr key={`${l.name}-${l.source}`} className="border-t border-bg">
                      <td className="py-1">{l.name}</td>
                      <td className="py-1">
                        <Tag tone={l.kind === "unknown" ? "caution" : "muted"}>{COST_KIND_LABEL[l.kind]}{l.kind === "unknown" ? " · 고정비로 가정" : ""}</Tag>
                      </td>
                      <td className="py-1 text-right tabular-nums">{won(l.amount)}</td>
                      <td className="py-1 pl-2 text-xs text-muted">{l.note}</td>
                    </tr>
                  ))}
                  {adj.replacement_labor > 0 && (
                    <tr className="border-t border-bg">
                      <td className="py-1">대체 인건비 (조정)</td>
                      <td className="py-1">
                        <Tag>고정비 · AI 추정</Tag>
                      </td>
                      <td className="py-1 text-right tabular-nums">{won(adj.replacement_labor)}</td>
                      <td className="py-1 pl-2 text-xs text-muted">2026년 최저시급 기준</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </details>
          </>
        )}
      </Box>

      {/* 3. 시설권리금 */}
      <Box title="시설권리금 (AI 추정 · 참고 범위)">
        {base.facility.rows.length === 0 ? (
          <p className="text-sm text-muted">{base.facility.basis}</p>
        ) : (
          <>
            <Rows
              rows={[
                ["양도인 주장 시설권리금", base.facility.claimed === null ? "미분류" : won(base.facility.claimed)],
                ["확인 가능한 시설 가치", `${won(base.facility.value)} (AI 추정 하단 합)`],
                ["증빙 부족 또는 초과 요구 금액", base.facility.excess === null ? "시설권리금 미분류" : won(base.facility.excess)],
              ]}
            />
            <ul className="mt-3 space-y-1 text-sm">
              {base.facility.rows.map((r) => (
                <li key={r.name} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}{r.qty > 1 ? ` ×${r.qty}` : ""}</span>
                  <Tag tone={r.verdict === "ok" ? "outline" : r.verdict === "over" || r.verdict === "excluded" ? "warn" : "muted"}>{FACILITY_VERDICT_LABEL[r.verdict]}</Tag>
                  <span className="text-xs text-muted">
                    반영가 {won(r.claimed)}
                    {r.low !== null && r.high !== null && ` · 참고 범위 ${won(r.low)}~${won(r.high)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{base.facility.basis}. 중고 매물 시세 조회가 아니라 AI의 감가 기준 추정이고, 호가일 수 있어요.</p>
          </>
        )}
      </Box>

      {/* 4. 권리금 회수기간 */}
      <Box title="권리금 회수기간">
        <Rows
          rows={[
            ["총 요구 권리금", won(adj.premium)],
            ["바닥권리금", base.premium.floor === null ? "미분류" : won(base.premium.floor)],
            ["확인된 시설 잔존가치", won(base.facility.value)],
            ["양수인 기준 월 예상 이익", won(a.net)],
            ["바닥권리금 제외 회수기간", months(a.payback_excl_floor) ?? a.payback_excl_floor.basis, true],
            ["바닥권리금 포함 회수기간", months(a.payback_incl_floor) ?? a.payback_incl_floor.basis, true],
            ["입지 프리미엄 부담", base.premium.floor === null ? "바닥권리금 미분류" : (months(a.floor_burden) ?? a.floor_burden.basis)],
          ]}
        />
        {base.premium.unclassified > 0 && <p className="mt-2 text-xs text-muted">미분류 권리금 {won(base.premium.unclassified)} (영업·시설·바닥으로 나누지 않은 금액)</p>}
        {a.payback_excl_floor.months !== null && a.payback_incl_floor.months !== null && base.premium.floor ? (
          <p className="mt-3 rounded-lg bg-bg p-3 text-sm">
            바닥권리금을 제외하면 영업·시설 기준 회수기간은 {a.payback_excl_floor.months}개월이에요. 바닥권리금까지 수용하면 실제 거래 기준 회수기간은 {a.payback_incl_floor.months}개월이에요. 추가{" "}
            {a.floor_burden.months}개월을 감수할 만큼의 입지 근거와 임대차 안정성이 있는지 확인하세요.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">계산: {a.payback_incl_floor.basis}</p>
        {a.assumptions.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
            {a.assumptions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </Box>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-bg p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={"mt-1 text-lg font-bold tabular-nums " + (warn ? "text-warn" : "")}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <dl className="divide-y divide-bg text-sm">
      {rows.map(([k, v, strong]) => (
        <div key={k} className="flex justify-between gap-4 py-1.5">
          <dt className={strong ? "font-medium" : "text-muted"}>{k}</dt>
          <dd className={"text-right tabular-nums " + (strong ? "font-bold" : "")}>{v}</dd>
        </div>
      ))}
    </dl>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      {children}
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
      <span className="mt-0.5 block text-xs text-muted">{won(value)}</span>
    </>
  );
}
