"use client";

// AI 실사 센터 (PRD 9번 화면 7). 양수인 AI ↔ 양도인 AI 3곳의 질문·답·상태를 한 화면에서 본다.
// 상단: 비교 중인 매물·질문 수·답변 완료·승인 대기·미확인 / 가운데: 매물별 질문 상태 / 오른쪽: 통합 분석

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag, { type TagTone } from "@/components/Tag";
import AgentGraph from "@/components/viz/AgentGraph";
import AgentIcon from "@/components/viz/AgentIcon";
import { AGENTS, type AgentKey } from "@/lib/agent-registry";
import type { AgentMessage } from "@/lib/agents";
import { apiFetch } from "@/lib/api-client";
import type { Comparison, ComparisonRow } from "@/lib/compare";
import { setCompareIds } from "@/lib/compare-selection";
import { formatTime, won } from "@/lib/format";
import { AGENT_STATUS_LABEL, ANSWER_TYPE_LABEL, TOPIC_LABEL } from "@/lib/labels";
import type { DiligenceSummary } from "@/lib/openai";

type TaskDetail = {
  task: { id: string; created_at: string; listing_ids: string[]; status: string };
  messages: AgentMessage[];
  comparison: Comparison;
  nda: Record<string, string>;
  ai_summary: { created_at: string; result: DiligenceSummary } | null;
};

const STATUS_TONE: Record<string, TagTone> = {
  answered: "outline",
  pending_approval: "caution",
  needs_documents: "caution",
  answering: "muted",
  queued: "muted",
  created: "muted",
  rejected: "warn",
  error: "warn",
};

export default function DiligenceView({ ids, taskParam }: { ids: string[]; taskParam: string | null }) {
  const user = useUser();
  const [taskId, setTaskId] = useState<string | null>(taskParam);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // 처음: 주소에 task가 없으면 같은 매물로 만든 가장 최근 실사를 찾는다
  useEffect(() => {
    if (taskParam || user.role !== "buyer") return;
    apiFetch<{ tasks: { id: string; listing_ids: string[] }[] }>("/api/agent/tasks")
      .then(({ tasks }) => {
        const same = ids.length ? tasks.find((t) => t.listing_ids.length === ids.length && ids.every((i) => t.listing_ids.includes(i))) : tasks[0];
        setTaskId(same?.id ?? null);
        setChecked(true);
      })
      .catch((e: Error) => (setError(e.message), setChecked(true)));
  }, [ids, taskParam, user.id, user.role]);

  const load = useCallback(() => {
    if (!taskId) return;
    apiFetch<TaskDetail>(`/api/agent/tasks/${taskId}`)
      .then((d) => (setDetail(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [taskId]);
  useEffect(load, [load]);

  // 양도인 승인을 기다리는 질문이 있으면 10초마다 새로 확인한다
  const waiting = detail?.messages.some((m) => m.status === "pending_approval");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [waiting, load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요. 잠시 후 다시 해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function start(listingIds: string[]) {
    setBusy("start");
    setError(null);
    try {
      const { task_id } = await apiFetch<{ task_id: string }>("/api/agent/tasks", { method: "POST", body: JSON.stringify({ listing_ids: listingIds }) });
      setCompareIds(listingIds);
      setTaskId(task_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실사를 시작하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  if (user.role !== "buyer") {
    return <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">AI 실사는 양수인 모드에서 시작해요. 위에서 &quot;양수인&quot;을 눌러 주세요. 받은 AI 질문은 요청함에서 볼 수 있어요.</p>;
  }

  const startPanel = (
    <section className="rounded-xl bg-card p-5">
      <p className="font-medium">AI 실사 시작하기</p>
      <p className="mt-1 text-sm text-muted">
        {ids.length
          ? `담은 매물 ${ids.length}곳의 양도인 AI에게 한 번에 물어봐요. 지금 볼 수 없는 정보만 물어요. (20초~1분)`
          : "먼저 매물 찾기에서 매물을 최대 3개 담아 주세요."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ids.length > 0 && (
          <button type="button" disabled={!!busy} onClick={() => start(ids)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === "start" ? "양도인 AI들에게 묻는 중..." : `${ids.length}곳 AI 실사 시작`}
          </button>
        )}
        {busy === "start" && (
          // 실제 요청이 진행되는 동안에만 보이는 흐름 표시
          <svg viewBox="0 0 240 24" className="h-6 w-60" aria-label="질문을 보내고 답을 기다리는 중">
            <circle cx="12" cy="12" r="9" fill="var(--accent)" />
            <path d="M24 12 H216" stroke="var(--accent)" strokeWidth="2.5" className="viz-flow" fill="none" />
            {Array.from({ length: ids.length }).map((_, i) => (
              <rect key={i} x={220} y={2 + i * 7} width="16" height="5" rx="2" fill="var(--muted)" opacity="0.5" />
            ))}
          </svg>
        )}
        <Link href="/listings" className="rounded-lg bg-bg px-4 py-2 text-sm font-medium">
          매물 담으러 가기
        </Link>
      </div>
    </section>
  );

  if (!taskId) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Title />
        {error && <ErrorBox>{error}</ErrorBox>}
        {checked || taskParam ? startPanel : <p className="text-sm text-muted">불러오는 중...</p>}
      </div>
    );
  }
  if (!detail) return <div className="mx-auto max-w-6xl space-y-4"><Title />{error ? <ErrorBox>{error}</ErrorBox> : <p className="text-sm text-muted">불러오는 중...</p>}</div>;

  const msgs = detail.messages;
  const rows = detail.comparison.rows;
  const unknownTotal = rows.reduce((a, r) => a + r.unknowns.length, 0);
  const stats: [string, number, TagTone][] = [
    ["보낸 질문", msgs.length, "muted"],
    ["받은 답변", msgs.filter((m) => m.status === "answered" && m.answer_type === "auto").length, "outline"],
    ["승인 기다리는 중", msgs.filter((m) => m.status === "pending_approval").length, "caution"],
    ["답을 못 받음", msgs.filter((m) => m.answer_type === "denied" || m.status === "needs_documents" || m.status === "rejected").length, "warn"],
    ["아직 모르는 정보", unknownTotal, "muted"],
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Title />
      {error && <ErrorBox>{error}</ErrorBox>}

      {/* 상단 */}
      <section className="rounded-xl bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">실사 중인 매물</span>
            {rows.map((r) => (
              <Tag key={r.facts.listing.id} tone="outline">
                {r.facts.listing.name}
              </Tag>
            ))}
            <span className="text-xs text-muted">· 시작 {formatTime(detail.task.created_at)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => run("rerun", () => apiFetch(`/api/agent/tasks/${detail.task.id}/rerun`, { method: "POST" }))} className="rounded-lg bg-bg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {busy === "rerun" ? "다시 묻는 중..." : "못 받은 질문 다시 묻기"}
            </button>
            <button type="button" onClick={load} className="rounded-lg bg-bg px-3 py-1.5 text-sm">
              새로고침
            </button>
            <Link href={`/compare?ids=${detail.task.listing_ids.join(",")}`} className="rounded-lg bg-bg px-3 py-1.5 text-sm font-medium">
              비교 보기
            </Link>
          </div>
        </div>
        <div className="mt-3 grid items-center gap-4 lg:grid-cols-[1fr_14rem]">
          <div className="mx-auto w-full max-w-2xl min-w-0">
            <AgentGraph
              nodes={rows.map((r) => {
                const q = msgs.filter((m) => m.listing_id === r.facts.listing.id);
                return {
                  id: r.facts.listing.id,
                  name: r.facts.listing.name,
                  answered: q.filter((m) => m.status === "answered").length,
                  waiting: q.filter((m) => ["created", "queued", "answering"].includes(m.status)).length,
                  pending: q.filter((m) => m.status === "pending_approval").length,
                  blocked: q.filter((m) => ["rejected", "needs_documents", "error"].includes(m.status)).length,
                  total: q.length,
                };
              })}
              selected={selected}
              onSelect={(id) => setSelected(selected === id ? null : id)}
            />
            <p className="text-center text-xs text-muted">매물을 누르면 그 매물 질문만 보여요 · 파랑: 답변 옴 · 주황: 승인 기다리는 중 · 빨강: 답을 못 받은 질문 있음</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {stats.map(([label, n, tone]) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className={"text-lg font-bold tabular-nums " + (n > 0 && tone === "warn" ? "text-warn" : n > 0 && tone === "caution" ? "text-caution" : "")}>{n}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-2 text-xs text-muted">
          NDA에 동의했거나 양도인이 자료를 더 올렸다면 &quot;못 받은 질문 다시 묻기&quot;를 눌러 보세요. 승인을 기다리는 질문은 승인되는 대로 답이 와요.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* 가운데: 매물별 질문 */}
        <div className={"grid gap-4 " + (selected ? "" : "xl:grid-cols-3")}>
          {rows.filter((r) => !selected || r.facts.listing.id === selected).map((r) => (
            <ListingColumn
              key={r.facts.listing.id}
              row={r}
              messages={msgs.filter((m) => m.listing_id === r.facts.listing.id)}
              nda={detail.nda[r.facts.listing.id]}
              busy={busy}
              onNda={() =>
                run("nda" + r.facts.listing.id, async () => {
                  await apiFetch(`/api/listings/${r.facts.listing.id}/nda`, { method: "POST", body: JSON.stringify({ agree: true }) });
                  await apiFetch(`/api/agent/tasks/${detail.task.id}/rerun`, { method: "POST" });
                })
              }
            />
          ))}
        </div>

        {/* 오른쪽: 통합 분석 */}
        <IntegratedPanel detail={detail} busy={busy} onSummary={() => run("summary", () => apiFetch(`/api/agent/tasks/${detail.task.id}/summary`, { method: "POST" }))} />
      </div>
    </div>
  );
}

function Title() {
  return (
    <div className="viz-fade">
      <h1 className="text-xl font-bold">AI 실사</h1>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <AgentChip agent="buyer" /> 가 매물마다 <AgentChip agent="seller" /> 에게 빠진 정보만 묻고, 답이 모이면 <AgentChip agent="diligence" /> 가 비교해요.
      </p>
    </div>
  );
}

function AgentChip({ agent }: { agent: AgentKey }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium text-text" title={AGENTS[agent].does}>
      <AgentIcon agent={agent} className="size-3.5 text-accent" />
      {AGENTS[agent].name}
    </span>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{children}</p>;
}

function ListingColumn({ row, messages, nda, busy, onNda }: { row: ComparisonRow; messages: AgentMessage[]; nda: string | undefined; busy: string | null; onNda: () => void }) {
  const l = row.facts.listing;
  const needsNda = messages.some((m) => m.answer_type === "denied" && m.answer?.includes("NDA"));
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <Link href={`/listings/${l.id}`} className="font-bold hover:text-accent">
            {l.name}
          </Link>
          <span className="shrink-0 text-sm font-bold tabular-nums">{row.recommendation.total}<span className="text-xs font-normal text-muted">/100</span></span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {l.is_sample && <Tag>샘플</Tag>}
          {nda === "test_agreed" ? <Tag tone="outline">NDA 동의함</Tag> : <Tag>NDA 전</Tag>}
          {row.recommendation.info_lacking && <Tag tone="caution">정보 부족</Tag>}
        </div>
        {nda !== "test_agreed" && needsNda && (
          <button type="button" disabled={!!busy} onClick={onNda} className="mt-2 w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
            {busy === "nda" + l.id ? "동의하고 다시 묻는 중..." : "NDA 동의하고 다시 묻기 (시연용 · 법적 효력 없음)"}
          </button>
        )}
      </div>
      {messages.length === 0 ? (
        <p className="rounded-lg bg-bg p-3 text-sm text-muted">물어볼 게 없었어요. 필요한 정보가 이미 다 공개돼 있어요.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <QuestionRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionRow({ m }: { m: AgentMessage }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg bg-bg p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag tone="outline">{TOPIC_LABEL[m.topic] ?? m.topic}</Tag>
        <Tag tone={STATUS_TONE[m.status] ?? "muted"}>{AGENT_STATUS_LABEL[m.status] ?? m.status}</Tag>
        {m.status === "answered" && m.answer_type && m.answer_type !== "auto" && <Tag tone="warn">{ANSWER_TYPE_LABEL[m.answer_type]}</Tag>}
        {!m.ai_used && m.status === "answered" && m.answer_type === "auto" && <Tag>자료 원문으로 답함</Tag>}
      </div>
      <p className="mt-2 text-xs text-muted">물어본 것: {m.question}</p>
      {m.answer && <p className="mt-1.5 whitespace-pre-line">{m.answer}</p>}
      {m.error && <p className="mt-1 text-xs text-warn">답을 받지 못했어요: {m.error}</p>}
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span>{formatTime(m.updated_at)}</span>
        {m.evidence.length > 0 && (
          <button type="button" onClick={() => setOpen(!open)} className="text-accent">
            {open ? "근거 접기" : `근거 ${m.evidence.length}개 보기`}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 max-h-56 overflow-auto rounded-md bg-card p-2">
          <table className="w-full text-xs">
            <tbody>
              {m.evidence.map((e, i) => (
                <tr key={i} className="border-t border-bg align-top first:border-0">
                  <td className="py-1 pr-2">{e.item}</td>
                  <td className="py-1 pr-2 text-muted">{e.period ?? "-"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{e.value}</td>
                  <td className="py-1 text-muted">
                    {e.trust} · {e.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function IntegratedPanel({ detail, busy, onSummary }: { detail: TaskDetail; busy: string | null; onSummary: () => void }) {
  const rows = detail.comparison.rows;
  const metric = (label: string, get: (r: ComparisonRow) => string) => (
    <tr className="border-t border-bg">
      <th className="py-1.5 pr-2 text-left font-normal text-muted">{label}</th>
      {rows.map((r) => (
        <td key={r.facts.listing.id} className="py-1.5 pl-2 text-right tabular-nums">
          {get(r)}
        </td>
      ))}
    </tr>
  );
  const v = (n: number | null, f: (n: number) => string = won) => (n === null ? "미확인" : f(n));

  // 코드로 찾은 차이·불일치
  const mismatches = rows.flatMap((r) => [
    ...r.facts.report_warnings.map((w) => `${r.facts.listing.name}: ${w}`),
    ...(r.facts.claimed_gap.value !== null && Math.abs(r.facts.claimed_gap.value) > 15 && !r.facts.report_warnings.some((w) => w.startsWith("양도인이 말한"))
      ? [`${r.facts.listing.name}: 양도인 주장 매출과 자료 차이 ${r.facts.claimed_gap.value}% (${r.facts.claimed_gap.basis})`]
      : []),
  ]);
  const next = detail.messages
    .filter((m) => m.status !== "answered" || m.answer_type !== "auto")
    .map((m) => {
      const name = rows.find((r) => r.facts.listing.id === m.listing_id)?.facts.listing.name ?? "";
      const why = m.status === "pending_approval" ? "양도인 승인을 기다리는 중" : m.status === "needs_documents" ? "양도인이 자료를 더 올려야 해요" : m.answer?.includes("NDA") ? "NDA 동의가 필요해요" : "답을 받지 못했어요";
      return `${name} · ${TOPIC_LABEL[m.topic]} — ${why}`;
    });

  return (
    <aside className="space-y-4">
      <section className="rounded-xl bg-card p-4">
        <p className="mb-2 font-medium">한눈에 비교</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th />
                {rows.map((r) => (
                  <th key={r.facts.listing.id} className="pb-1 pl-2 text-right font-medium">
                    {r.facts.listing.name.replace(/^서울 /, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metric("초기 투자금", (r) => v(r.facts.initial_investment.value))}
              {metric("월평균 매출", (r) => v(r.facts.monthly_sales_avg.value))}
              {metric("월평균 비용", (r) => v(r.facts.monthly_cost_avg.value))}
              {metric("내 기준 예상 순수익", (r) => v(r.fit.expected_profit.value))}
              {metric("회수 기간", (r) => v(r.fit.payback_months.value, (n) => `${n}개월`))}
              {metric("점주 근무", (r) => v(r.facts.owner_weekly_hours.value, (n) => `주 ${n}시간`))}
              {metric("임대차 남은 기간", (r) => v(r.facts.lease_remaining_months.value, (n) => `${n}개월`))}
              {metric("매출 검증 등급", (r) => r.facts.report_grade.value ?? "미확인")}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">예상 순수익과 회수 기간에는 추가 인건비(2026년 최저시급 기준) 가정이 들어 있어요. 근거는 비교 화면에서 볼 수 있어요.</p>
      </section>

      <section className="rounded-xl bg-card p-4 text-sm">
        <p className="mb-2 font-medium">확인이 필요한 차이</p>
        {mismatches.length === 0 ? <p className="text-muted">자료끼리 어긋난 곳을 찾지 못했어요.</p> : (
          <ul className="space-y-1.5">
            {mismatches.map((x) => (
              <li key={x} className="rounded-md bg-warn/10 px-2 py-1.5 text-xs text-warn">{x}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card p-4 text-sm">
        <p className="mb-2 font-medium">아직 모르는 정보</p>
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.facts.listing.id}>
              <b>{r.facts.listing.name}</b>: {r.unknowns.length ? r.unknowns.join(", ") : "없음"}
            </li>
          ))}
        </ul>
        {next.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-bg pt-2 text-xs text-muted">
            {next.map((x) => (
              <li key={x}>· {x}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card p-4 text-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-medium">AI 한 줄 정리</p>
          <button type="button" disabled={!!busy} onClick={onSummary} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {busy === "summary" ? "정리하는 중..." : detail.ai_summary ? "다시 정리하기" : "AI로 정리하기"}
          </button>
        </div>
        {detail.ai_summary ? (
          <div className="space-y-2">
            <p className="font-medium">{detail.ai_summary.result.headline}</p>
            <ul className="list-disc space-y-1 pl-4 text-xs">
              {detail.ai_summary.result.differences.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="pt-1 text-xs font-medium">다음에 물어볼 것</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
              {detail.ai_summary.result.next_questions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">{formatTime(detail.ai_summary.created_at)} · 숫자는 자동 계산한 값만 써요.</p>
          </div>
        ) : (
          <p className="text-xs text-muted">받은 답과 비교 결과를 AI가 짧은 글로 정리해요. 숫자는 위 표의 값만 써요.</p>
        )}
      </section>
    </aside>
  );
}
