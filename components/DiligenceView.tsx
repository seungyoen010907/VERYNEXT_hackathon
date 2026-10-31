"use client";

// AI 실사 센터 (PRD 9번 화면 7). 양수인 AI ↔ 양도인 AI 3곳이 실제로 주고받는 질문·답을 매물별 대화창으로 본다.
// 상단: 비교 중인 매물·질문 수·답변 완료·승인 대기·미확인 / 가운데: 매물별 대화창 (탭으로 상태표) / 오른쪽: 통합 비교·분석
// 실사는 서버에서 응답 뒤에 진행되므로, 진행 중이면 2초마다 새로 불러와 질문 → 답하는 중 → 답이 차례로 붙는다.
// 화면의 말풍선은 모두 DB(agent_messages)에 저장된 실제 질문·답이다. 대본이나 가짜 타이핑 효과는 없다.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag, { type TagTone } from "@/components/Tag";
import type { AgentMessage } from "@/lib/agents";
import { apiFetch } from "@/lib/api-client";
import type { Comparison, ComparisonRow } from "@/lib/compare";
import { setCompareIds } from "@/lib/compare-selection";
import { formatTime, won } from "@/lib/format";
import { AGENT_STATUS_LABEL, ANSWER_TYPE_LABEL, customTopicsLabel, TOPIC_LABEL } from "@/lib/labels";
import type { DiligenceSummary } from "@/lib/openai";

type TaskDetail = {
  task: { id: string; created_at: string; listing_ids: string[]; status: string };
  messages: AgentMessage[];
  comparison: Comparison;
  nda: Record<string, string>;
  nda_agreed_at: Record<string, string>;
  grants: { id: string; listing_id: string; status: string; created_at: string; decided_at: string | null }[];
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

export default function DiligenceView({ ids, taskParam, fresh }: { ids: string[]; taskParam: string | null; fresh: boolean }) {
  const user = useUser();
  const [taskId, setTaskId] = useState<string | null>(taskParam);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(fresh);
  const [tab, setTab] = useState<"chat" | "table">("chat");

  // 처음: 주소에 task가 없으면 같은 매물로 만든 가장 최근 실사를 찾는다 (new=1이면 찾지 않고 시작 화면)
  useEffect(() => {
    if (taskParam || user.role !== "buyer") return;
    if (fresh) return; // 시작 화면부터 (checked가 처음부터 true)
    apiFetch<{ tasks: { id: string; listing_ids: string[] }[] }>("/api/agent/tasks")
      .then(({ tasks }) => {
        const same = ids.length ? tasks.find((t) => t.listing_ids.length === ids.length && ids.every((i) => t.listing_ids.includes(i))) : tasks[0];
        setTaskId(same?.id ?? null);
        setChecked(true);
      })
      .catch((e: Error) => (setError(e.message), setChecked(true)));
  }, [ids, taskParam, fresh, user.id, user.role]);

  const load = useCallback(() => {
    if (!taskId) return;
    apiFetch<TaskDetail>(`/api/agent/tasks/${taskId}`)
      .then((d) => (setDetail(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, [taskId]);
  useEffect(load, [load]);

  // 진행 중(질문 만드는 중·전달 대기·답하는 중)이면 2초마다, 양도인 쪽을 기다리면 5초마다 새로 불러온다
  const active = !!detail && (detail.task.status === "running" || detail.messages.some((m) => m.status === "created" || m.status === "queued" || m.status === "answering"));
  const waiting = !!detail?.messages.some((m) => m.status === "pending_approval" || m.status === "needs_documents");
  const pollMs = active ? 2_000 : waiting ? 5_000 : 0;
  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [pollMs, load]);

  // 성공하면 true (직접 질문 입력칸은 성공했을 때만 비운다)
  async function run(key: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패했어요.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  // listingIds가 없으면 인수 조건 기준 추천 매물(최대 3개)로 시작한다
  async function start(listingIds?: string[]) {
    setBusy(listingIds ? "start" : "auto");
    setError(null);
    try {
      const { task_id, listing_ids } = await apiFetch<{ task_id: string | null; listing_ids: string[] }>("/api/agent/tasks", {
        method: "POST",
        body: JSON.stringify(listingIds ? { listing_ids: listingIds } : { auto: true }),
      });
      if (!task_id) {
        setError("인수 조건(예산)에 맞는 공개 매물이 없어서 실사를 시작하지 못했어요. 인수 조건을 확인하거나 매물을 직접 골라주세요.");
        return;
      }
      setCompareIds(listing_ids);
      setDetail(null);
      setTaskId(task_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실사를 시작하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  if (user.role !== "buyer") {
    return <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">AI 실사는 양수인이 시작해요. 헤더에서 &quot;양수인&quot;을 골라주세요. 양도인은 매물의 &quot;구매자 요청 관리&quot;에서 AI 질문을 볼 수 있어요.</p>;
  }

  const startPanel = (
    <section className="rounded-xl bg-card p-5">
      <p className="font-medium">새 AI 실사</p>
      <p className="mt-1 text-sm text-muted">
        내 AI가 인수 조건에 맞는 매물을 최대 3개 고르고, 각 매물의 양도인 AI에 동시에 질문해요. 매물마다 지금 볼 수 없는 정보만 묻고, 대화가 오가는 과정이 바로 보여요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => start()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy === "auto" ? "추천 매물을 고르는 중..." : "추천 매물로 AI 실사 시작"}
        </button>
        {ids.length > 0 && (
          <button type="button" disabled={!!busy} onClick={() => start(ids)} className="rounded-lg bg-bg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy === "start" ? "실사를 만드는 중..." : `직접 고른 매물로 시작 (${ids.length}개)`}
          </button>
        )}
        <Link href="/buyer/profile" className="rounded-lg bg-bg px-4 py-2 text-sm font-medium">
          인수 조건
        </Link>
        <Link href="/listings" className="rounded-lg bg-bg px-4 py-2 text-sm font-medium">
          매물 직접 고르기
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
    ["전체 질문", msgs.length, "muted"],
    ["답변 완료", msgs.filter((m) => m.status === "answered" && (m.answer_type === "auto" || m.answer_type === "seller_reply")).length, "outline"],
    ["승인 대기", msgs.filter((m) => m.status === "pending_approval").length, "caution"],
    ["거부·자료 없음", msgs.filter((m) => m.answer_type === "denied" || m.status === "needs_documents" || m.status === "rejected").length, "warn"],
    ["미확인 항목", unknownTotal, "muted"],
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Title />
      {error && <ErrorBox>{error}</ErrorBox>}

      {/* 상단 */}
      <section className="rounded-xl bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">비교 중</span>
            {rows.map((r) => (
              <Tag key={r.facts.listing.id} tone="outline">
                {r.facts.listing.name}
              </Tag>
            ))}
            <span className="text-xs text-muted">· 시작 {formatTime(detail.task.created_at)}</span>
            {active && (
              <Tag tone="accent">
                <span className="animate-pulse">● 실시간 진행 중</span>
              </Tag>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || active} onClick={() => run("rerun", () => apiFetch(`/api/agent/tasks/${detail.task.id}/rerun`, { method: "POST" }))} className="rounded-lg bg-bg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {busy === "rerun" ? "다시 묻는 중..." : "다시 물어보기"}
            </button>
            <button type="button" onClick={load} className="rounded-lg bg-bg px-3 py-1.5 text-sm">
              새로고침
            </button>
            <button type="button" disabled={!!busy || active} onClick={() => (setTaskId(null), setDetail(null), setChecked(true))} className="rounded-lg bg-bg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              새 실사
            </button>
            <Link href={`/compare?ids=${detail.task.listing_ids.join(",")}`} className="rounded-lg bg-bg px-3 py-1.5 text-sm font-medium">
              비교표
            </Link>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stats.map(([label, n, tone]) => (
            <div key={label} className="rounded-lg bg-bg px-3 py-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-lg font-bold tabular-nums">
                {n} {n > 0 && tone !== "muted" && <Tag tone={tone}>{label}</Tag>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">
          NDA에 동의하거나 양도인이 승인하거나 자료를 추가하면 멈춘 질문에 자동으로 다시 답이 와요. &quot;다시 물어보기&quot;는 새로 빠진 정보까지 한 번 더 확인할 때 써요.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* 가운데: 매물별 대화창 / 상태표 */}
        <div className="min-w-0 space-y-3">
          <div className="flex gap-1 rounded-lg bg-card p-1 text-sm" role="tablist">
            {(
              [
                ["chat", "에이전트 대화"],
                ["table", "질문별 상태표"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={"flex-1 rounded-md px-3 py-1.5 " + (tab === k ? "bg-accent font-medium text-white" : "text-muted hover:text-text")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={"grid gap-4 " + (rows.length >= 3 ? "xl:grid-cols-3" : rows.length === 2 ? "xl:grid-cols-2" : "")}>
            {rows.map((r) => {
              const lid = r.facts.listing.id;
              const props = {
                row: r,
                messages: msgs.filter((m) => m.listing_id === lid),
                nda: detail.nda[lid],
                busy,
                // 동의하면 서버가 NDA 때문에 멈춘 질문을 자동으로 다시 묻는다
                onNda: () => run("nda" + lid, () => apiFetch(`/api/listings/${lid}/nda`, { method: "POST", body: JSON.stringify({ agree: true }) })),
              };
              return tab === "chat" ? (
                <ChatColumn
                  key={lid}
                  {...props}
                  onAsk={(question) => run("ask" + lid, () => apiFetch(`/api/agent/tasks/${detail.task.id}/ask`, { method: "POST", body: JSON.stringify({ listing_id: lid, question }) }))}
                  preparing={detail.task.status === "running"}
                  ndaAgreedAt={detail.nda_agreed_at?.[lid] ?? null}
                  grants={(detail.grants ?? []).filter((g) => g.listing_id === lid)}
                />
              ) : (
                <ListingColumn key={lid} {...props} />
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 통합 분석 (답이 들어오면 바뀐 칸을 칠한다) */}
        <IntegratedPanel detail={detail} busy={busy} onSummary={() => run("summary", () => apiFetch(`/api/agent/tasks/${detail.task.id}/summary`, { method: "POST" }))} />
      </div>
    </div>
  );
}

function Title() {
  return (
    <div>
      <h1 className="text-xl font-bold">AI 실사 센터</h1>
      <p className="text-sm text-muted">내 AI 에이전트가 매물마다 양도인 AI와 실제로 질문·답을 주고받아요. 양도인 AI는 공개 범위 안에서만 답하고, 나머지는 승인 요청으로 바꿔요.</p>
    </div>
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
          {nda === "test_agreed" ? <Tag tone="outline">NDA 테스트 동의</Tag> : <Tag>NDA 전</Tag>}
          {row.recommendation.info_lacking && <Tag tone="caution">정보 부족</Tag>}
        </div>
        {nda !== "test_agreed" && needsNda && (
          <button type="button" disabled={!!busy} onClick={onNda} className="mt-2 w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
            {busy === "nda" + l.id ? "동의하는 중..." : "NDA 테스트 동의 (법적 효력 없음) → 자동으로 다시 묻기"}
          </button>
        )}
      </div>
      {messages.length === 0 ? (
        <p className="rounded-lg bg-bg p-3 text-sm text-muted">물어볼 게 없었어요. 필요한 정보가 이미 공개돼 있어요.</p>
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

// ---- 대화창: 질문과 그 답을 한 묶음으로, 답이 정해진(또는 다시 묻기 시작한) 시각 순서로. 사이에 사건(NDA 동의, 열람 승인) ----

type ChatItem = { kind: "pair"; t: string; m: AgentMessage } | { kind: "event"; t: string; text: string; tone: TagTone };

const GRANT_EVENT: Record<string, [string, TagTone]> = {
  approved: ["양도인이 자료 열람을 승인했어요", "outline"],
  rejected: ["양도인이 열람 요청을 거절했어요", "warn"],
  revoked: ["양도인이 열람 권한을 회수했어요", "warn"],
};

function chatItems(messages: AgentMessage[], ndaAgreedAt: string | null, grants: TaskDetail["grants"]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const m of messages) items.push({ kind: "pair", t: m.updated_at > m.created_at ? m.updated_at : m.created_at, m });
  if (ndaAgreedAt) items.push({ kind: "event", t: ndaAgreedAt, text: "NDA 테스트 동의 (법적 효력 없음) — 잠겨 있던 질문을 다시 물어요", tone: "outline" });
  // 자료마다 승인이 따로라 같은 시각의 같은 사건은 한 줄로 합친다
  const seen = new Set<string>();
  for (const g of grants) {
    const ev = GRANT_EVENT[g.status];
    if (!ev || !g.decided_at) continue;
    const key = `${g.status}|${g.decided_at.slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: "event", t: g.decided_at, text: ev[0], tone: ev[1] });
  }
  return items.sort((a, b) => a.t.localeCompare(b.t) || (a.kind === "event" ? -1 : b.kind === "event" ? 1 : 0));
}

function ChatColumn({
  row,
  messages,
  nda,
  busy,
  onNda,
  preparing,
  ndaAgreedAt,
  grants,
  onAsk,
}: {
  row: ComparisonRow;
  messages: AgentMessage[];
  nda: string | undefined;
  busy: string | null;
  onNda: () => void;
  preparing: boolean;
  ndaAgreedAt: string | null;
  grants: TaskDetail["grants"];
  onAsk: (question: string) => Promise<boolean>;
}) {
  const l = row.facts.listing;
  const [draft, setDraft] = useState("");
  const needsNda = messages.some((m) => m.answer_type === "denied" && m.answer?.includes("NDA"));
  const items = chatItems(messages, ndaAgreedAt, grants);
  const sellerName = `${l.name.replace(/^서울 /, "")} AI`;

  // 새 말풍선이 붙으면 아래로 내린다
  const scroller = useRef<HTMLDivElement>(null);
  const signature = items.map((i) => (i.kind === "event" ? i.t : i.m.id + i.m.status + i.m.updated_at)).join();
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [signature]);

  return (
    <section className="flex min-w-0 flex-col rounded-xl bg-card">
      <div className="border-b border-bg p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/listings/${l.id}`} className="font-bold hover:text-accent">
            {l.name}
          </Link>
          <span className="shrink-0 text-sm font-bold tabular-nums">{row.recommendation.total}<span className="text-xs font-normal text-muted">/100</span></span>
        </div>
        <p className="mt-0.5 text-xs text-muted">내 AI (양수인) ↔ {sellerName} (양도인)</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {l.is_sample && <Tag>샘플</Tag>}
          {nda === "test_agreed" ? <Tag tone="outline">NDA 테스트 동의</Tag> : <Tag>NDA 전</Tag>}
          {row.recommendation.info_lacking && <Tag tone="caution">정보 부족</Tag>}
        </div>
      </div>

      <div ref={scroller} className="flex max-h-[560px] min-h-[240px] flex-col gap-2.5 overflow-y-auto p-4">
        {items.length === 0 &&
          (preparing ? (
            <Bubble side="right" who="내 AI">
              <Typing>공개된 자료를 읽고 물어볼 것을 정리하는 중</Typing>
            </Bubble>
          ) : (
            <p className="m-auto text-center text-sm text-muted">물어볼 게 없었어요. 필요한 정보가 이미 공개돼 있어요.</p>
          ))}
        {items.map((it, i) =>
          it.kind === "event" ? (
            <div key={"e" + i} className="my-1 flex justify-center">
              <Tag tone={it.tone}>{it.text}</Tag>
            </div>
          ) : (
            <div key={it.m.id} className="flex flex-col gap-2">
              {it.m.question_type.startsWith("custom") ? (
                <>
                  <Bubble side="right" who="나 (양수인)" time={it.m.created_at} me>
                    {it.m.question}
                  </Bubble>
                  <AskCheck m={it.m} sellerName={sellerName} />
                </>
              ) : (
                <Bubble side="right" who="내 AI" time={it.m.created_at} tag={TOPIC_LABEL[it.m.topic] ?? it.m.topic}>
                  {it.m.question}
                </Bubble>
              )}
              <AnswerBubble m={it.m} sellerName={sellerName} />
            </div>
          ),
        )}
      </div>

      {/* 양수인이 직접 질문: 내 AI가 필요한 자료 범위를 확인하고 이 매물 AI에 물어본다 */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          if (await onAsk(draft)) setDraft("");
        }}
        className="flex gap-2 border-t border-bg p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          placeholder={`${l.name.replace(/^서울 /, "")}에 직접 물어보기`}
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <button type="submit" disabled={!!busy || !draft.trim()} className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy === "ask" + l.id ? "보내는 중" : "질문"}
        </button>
      </form>

      {nda !== "test_agreed" && needsNda && (
        <div className="border-t border-bg p-3">
          <button type="button" disabled={!!busy} onClick={onNda} className="w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
            {busy === "nda" + l.id ? "동의하는 중..." : "NDA 테스트 동의 (법적 효력 없음) → 자동으로 다시 묻기"}
          </button>
        </div>
      )}
    </section>
  );
}

function Bubble({ side, who, time, tag, me, children }: { side: "left" | "right"; who: string; time?: string; tag?: string; me?: boolean; children: React.ReactNode }) {
  const right = side === "right";
  const color = me ? "rounded-tr-sm bg-text text-card" : right ? "rounded-tr-sm bg-accent text-white" : "rounded-tl-sm bg-bg";
  return (
    <div className={"flex flex-col " + (right ? "items-end" : "items-start")}>
      <span className="mb-0.5 flex items-center gap-1 text-[11px] text-muted">
        {who}
        {tag && <Tag tone="outline">{tag}</Tag>}
        {time && <span>· {formatTime(time)}</span>}
      </span>
      <div className={"max-w-[92%] rounded-2xl px-3 py-2 text-sm " + color}>{children}</div>
    </div>
  );
}

function Typing({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span className="inline-flex gap-0.5" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-70" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </span>
  );
}

// 직접 질문을 내 AI가 확인한 결과: 어떤 자료 범위로 물을지 (확인 중이면 진행 표시)
function AskCheck({ m, sellerName }: { m: AgentMessage; sellerName: string }) {
  if (m.status === "created") {
    return (
      <Bubble side="right" who="내 AI">
        <Typing>질문을 확인하는 중</Typing>
      </Bubble>
    );
  }
  const topics = m.question_type.slice("custom:".length).split(",").filter(Boolean);
  const data = customTopicsLabel(`custom:${topics.filter((t) => t !== "seller").join(",")}`);
  const toSeller = topics.includes("seller");
  return (
    <Bubble side="right" who="내 AI">
      {data
        ? `질문을 확인했어요. ${data} 자료로 ${sellerName}에게 물어볼게요. 공개 범위 안의 자료로만 답을 받아요.${toSeller ? " 자료로 확인할 수 없는 부분은 양도인에게 직접 물어볼게요." : ""}`
        : "매물 자료로 확인할 수 있는 질문이 아니에요. 추측하지 않고 양도인에게 직접 전달할게요."}
    </Bubble>
  );
}

// 양도인 쪽 말풍선: 실제 상태(agent_messages.status)대로 그린다
function AnswerBubble({ m, sellerName }: { m: AgentMessage; sellerName: string }) {
  const [open, setOpen] = useState(false);
  if (m.status === "created") return null;
  if (m.status === "queued") {
    return <p className="text-[11px] text-muted">질문 전달됨 · {sellerName}의 답을 기다리는 중</p>;
  }
  if (m.status === "answering") {
    return (
      <Bubble side="left" who={sellerName}>
        <Typing>데이터룸에서 허용된 자료를 찾아 답하는 중</Typing>
      </Bubble>
    );
  }
  const who = m.answer_type === "seller_reply" ? "양도인 (직접 답변)" : sellerName;
  const tag =
    m.status === "pending_approval" ? (
      <Tag tone="caution">🔒 양도인 승인 대기</Tag>
    ) : m.status === "needs_documents" ? (
      <Tag tone="caution">추가 자료 요청</Tag>
    ) : m.status === "error" ? (
      <Tag tone="warn">오류</Tag>
    ) : m.answer_type === "seller_reply" ? (
      <Tag>점주 진술</Tag>
    ) : m.answer_type && m.answer_type !== "auto" ? (
      <Tag tone="warn">{ANSWER_TYPE_LABEL[m.answer_type] ?? m.answer_type}</Tag>
    ) : !m.ai_used ? (
      <Tag>AI 요약 없음</Tag>
    ) : null;
  return (
    <Bubble side="left" who={who} time={m.updated_at}>
      {m.status === "error" ? <span className="text-warn">답하지 못했어요: {m.error}</span> : <span className="whitespace-pre-line">{m.answer}</span>}
      {(tag || m.evidence.length > 0) && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tag}
          {m.evidence.length > 0 && (
            <button type="button" onClick={() => setOpen(!open)} className="text-xs text-accent">
              {open ? "근거 닫기" : `📎 근거 자료 ${m.evidence.length}`}
            </button>
          )}
        </span>
      )}
      {open && (
        <span className="mt-2 block max-h-56 overflow-auto rounded-md bg-card p-2">
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
        </span>
      )}
    </Bubble>
  );
}

function QuestionRow({ m }: { m: AgentMessage }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg bg-bg p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag tone="outline">{m.question_type.startsWith("custom") ? `직접 질문${customTopicsLabel(m.question_type) ? " · " + customTopicsLabel(m.question_type) : ""}` : (TOPIC_LABEL[m.topic] ?? m.topic)}</Tag>
        <Tag tone={STATUS_TONE[m.status] ?? "muted"}>{AGENT_STATUS_LABEL[m.status] ?? m.status}</Tag>
        {m.status === "answered" && m.answer_type && m.answer_type !== "auto" && <Tag tone="warn">{ANSWER_TYPE_LABEL[m.answer_type]}</Tag>}
        {!m.ai_used && m.status === "answered" && m.answer_type === "auto" && <Tag>AI 요약 없음</Tag>}
      </div>
      <p className="mt-2 text-xs text-muted">내 AI: {m.question}</p>
      {m.answer && <p className="mt-1.5 whitespace-pre-line">양도인 AI: {m.answer}</p>}
      {m.error && <p className="mt-1 text-xs text-warn">오류: {m.error}</p>}
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span>{formatTime(m.updated_at)}</span>
        {m.evidence.length > 0 && (
          <button type="button" onClick={() => setOpen(!open)} className="text-accent">
            {open ? "근거 닫기" : `근거 자료 ${m.evidence.length}`}
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

// 값이 바뀌면 key가 바뀌어 새로 그려지면서 잠깐 칠해진다 (처음 그릴 때는 칠하지 않는다)
function LiveValue({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const [changes, setChanges] = useState(0);
  if (shown !== text) {
    setShown(text);
    setChanges((n) => n + 1);
  }
  return (
    <span key={changes} className={changes ? "cell-flash px-1" : "px-1"}>
      {text}
    </span>
  );
}

function IntegratedPanel({ detail, busy, onSummary }: { detail: TaskDetail; busy: string | null; onSummary: () => void }) {
  const rows = detail.comparison.rows;
  const metric = (label: string, get: (r: ComparisonRow) => string) => (
    <tr className="border-t border-bg">
      <th className="py-1.5 pr-2 text-left font-normal text-muted">{label}</th>
      {rows.map((r) => (
        <td key={r.facts.listing.id} className="py-1.5 pl-2 text-right tabular-nums">
          <LiveValue text={get(r)} />
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
    .filter((m) => m.status !== "answered" || (m.answer_type !== "auto" && m.answer_type !== "seller_reply"))
    .map((m) => {
      const name = rows.find((r) => r.facts.listing.id === m.listing_id)?.facts.listing.name ?? "";
      const why = m.status === "pending_approval" ? "양도인 승인 대기" : m.answer_type === "needs_seller" ? "양도인 답변 필요" : m.status === "needs_documents" ? "양도인 자료 추가 필요" : m.answer?.includes("NDA") ? "NDA 동의 필요" : "답을 받지 못함";
      return `${name} · ${m.question_type.startsWith("custom") ? "직접 질문" : TOPIC_LABEL[m.topic]} — ${why}`;
    });

  return (
    <aside className="space-y-4">
      <section className="rounded-xl bg-card p-4">
        <p className="mb-2 font-medium">통합 비교 (코드 계산 · 답이 오면 자동 갱신)</p>
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
              {metric("내 조건 예상 순수익", (r) => v(r.fit.expected_profit.value))}
              {metric("회수 기간", (r) => v(r.fit.payback_months.value, (n) => `${n}개월`))}
              {metric("점주 근무", (r) => v(r.facts.owner_weekly_hours.value, (n) => `주 ${n}시간`))}
              {metric("임대차 남은 기간", (r) => v(r.facts.lease_remaining_months.value, (n) => `${n}개월`))}
              {metric("검증 등급", (r) => r.facts.report_grade.value ?? "미확인")}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">예상 순수익과 회수 기간은 추가 인건비 가정(2026년 최저시급)이 들어간 AI 추정이에요. 숫자 근거는 비교표에서 볼 수 있어요.</p>
      </section>

      <section className="rounded-xl bg-card p-4 text-sm">
        <p className="mb-2 font-medium">매물 간 불일치·확인 필요</p>
        {mismatches.length === 0 ? <p className="text-muted">찾은 불일치가 없어요.</p> : (
          <ul className="space-y-1.5">
            {mismatches.map((x) => (
              <li key={x} className="rounded-md bg-warn/10 px-2 py-1.5 text-xs text-warn">{x}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card p-4 text-sm">
        <p className="mb-2 font-medium">미확인 정보 · 다음 할 일</p>
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.facts.listing.id}>
              <b>{r.facts.listing.name}</b>: {r.unknowns.length ? r.unknowns.join(", ") : "미확인 항목 없음"}
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
          <p className="font-medium">양수인 AI 통합 분석</p>
          <button type="button" disabled={!!busy} onClick={onSummary} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {busy === "summary" ? "분석 중..." : detail.ai_summary ? "다시 분석" : "AI 분석 만들기"}
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
            <p className="pt-1 text-xs font-medium">다음 추천 질문</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
              {detail.ai_summary.result.next_questions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">{formatTime(detail.ai_summary.created_at)} · 숫자는 코드 계산값만 썼어요.</p>
          </div>
        ) : (
          <p className="text-xs text-muted">받은 답과 비교 결과를 AI가 글로 정리해요. 숫자는 위 표의 코드 계산값만 써요.</p>
        )}
      </section>
    </aside>
  );
}
