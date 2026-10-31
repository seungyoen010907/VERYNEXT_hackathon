"use client";

// 요청함: 내 매물 전부의 열람 요청(승인 대기 먼저)과 양수인 AI 질문을 모아 보여준다.
// 승인하면 그 자료를 기다리던 양수인 AI 질문에 양도인 AI가 자동으로 다시 답한다 (PATCH /api/grants/[id]).

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import AgentIcon from "@/components/viz/AgentIcon";
import { AGENTS } from "@/lib/agent-registry";
import { apiFetch } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import { AGENT_STATUS_LABEL, TOPIC_LABEL } from "@/lib/labels";

type Grant = { id: string; created_at: string; buyer_id: string; target_type: string; target_id: string; status: string; reason: string | null };
type Question = { id: string; updated_at: string; buyer_id: string; topic: string; question: string; status: string; answer: string | null; grant_id: string | null };
type Req = { grants: Grant[]; questions: Question[]; ndas: { buyer_id: string; status: string }[]; documents: { id: string; file_name: string }[]; users: { id: string; name: string }[] };
type Listing = { id: string; name: string; pending_requests: number };
type Item = { listing: Listing; data: Req };

export default function RequestsInbox() {
  const user = useUser();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (user.role !== "seller") return;
    let stop = false;
    apiFetch<{ listings: Listing[] }>("/api/home")
      .then(async ({ listings }) => {
        const all = await Promise.all(listings.map(async (l) => ({ listing: l, data: await apiFetch<Req>(`/api/listings/${l.id}/requests`) })));
        if (stop) return;
        setItems(all);
        setError(null);
      })
      .catch((e: Error) => !stop && setError(e.message));
    return () => {
      stop = true;
    };
  }, [user.id, user.role, tick]);

  async function decide(g: Grant, action: "approve" | "reject") {
    setBusy(g.id + action);
    try {
      await apiFetch(`/api/grants/${g.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  if (user.role !== "seller") return <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">요청함은 양도인 모드에서 볼 수 있어요. 위에서 &quot;양도인&quot;을 눌러 주세요.</p>;
  if (error) return <p className="mx-auto max-w-4xl rounded-lg bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!items) return <p className="text-sm text-muted">불러오는 중...</p>;

  const pending = items.flatMap((it) => it.data.grants.filter((g) => g.status === "requested").map((g) => ({ it, g })));
  const questions = items.flatMap((it) => it.data.questions.map((q) => ({ it, q }))).sort((a, b) => b.q.updated_at.localeCompare(a.q.updated_at));
  const name = (it: Item, uid: string) => it.data.users.find((u) => u.id === uid)?.name ?? "양수인";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="viz-fade">
        <h1 className="text-xl font-bold">요청함</h1>
        <p className="text-sm text-muted">승인하면 그 양수인만 자료를 볼 수 있고, 기다리던 질문에는 {AGENTS.seller.name}가 바로 답해요.</p>
      </div>

      <section className="viz-fade rounded-xl bg-card p-5">
        <div className="flex items-baseline gap-2">
          <span className={"text-3xl font-bold tabular-nums " + (pending.length ? "text-caution" : "")}>{pending.length}</span>
          <span className="text-sm text-muted">처리할 열람 요청</span>
        </div>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted">지금 처리할 요청이 없어요.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pending.map(({ it, g }, i) => {
              const doc = it.data.documents.find((d) => d.id === g.target_id);
              const q = it.data.questions.find((x) => x.grant_id === g.id);
              const nda = it.data.ndas.find((n) => n.buyer_id === g.buyer_id)?.status === "test_agreed";
              return (
                <li key={g.id} className="viz-fade flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-caution bg-bg p-3" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {name(it, g.buyer_id)} → {doc?.file_name ?? "자료"} {g.target_type === "document" ? "원본" : "요약"}
                    </p>
                    <p className="text-xs text-muted">
                      {it.listing.name} · {formatTime(g.created_at)} · {nda ? "NDA 동의함" : "NDA 동의 전"}
                    </p>
                    {q && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-muted">
                        <AgentIcon agent="buyer" className="mt-0.5 size-3.5 shrink-0" /> {q.question}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={!!busy} onClick={() => decide(g, "approve")} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                      {busy === g.id + "approve" ? "승인하는 중..." : "승인"}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => decide(g, "reject")} className="rounded-lg bg-card px-3 py-1.5 text-sm text-warn disabled:opacity-50">
                      거절
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <AgentIcon agent="seller" className="size-5 text-accent" /> {AGENTS.seller.name}가 받은 질문 {questions.length}개
        </h2>
        {questions.length === 0 ? (
          <p className="text-sm text-muted">아직 받은 질문이 없어요.</p>
        ) : (
          <ul className="divide-y divide-bg">
            {questions.slice(0, 30).map(({ it, q }) => (
              <li key={q.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag tone="outline">{TOPIC_LABEL[q.topic] ?? q.topic}</Tag>
                  <Tag tone={q.status === "answered" ? "outline" : q.status === "pending_approval" ? "caution" : "muted"}>{AGENT_STATUS_LABEL[q.status] ?? q.status}</Tag>
                  <span className="text-xs text-muted">
                    {it.listing.name} · {name(it, q.buyer_id)} · {formatTime(q.updated_at)}
                  </span>
                </div>
                <p className="mt-1 text-muted">{q.question}</p>
                {q.answer && <p className="mt-0.5 line-clamp-2">{q.answer}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">
        누가 언제 봤는지는 매물별 기록에서 볼 수 있어요:{" "}
        {items.map((it, i) => (
          <span key={it.listing.id}>
            {i > 0 && ", "}
            <Link href={`/listings/${it.listing.id}/requests`} className="text-accent">
              {it.listing.name}
            </Link>
          </span>
        ))}{" "}

      </p>
    </div>
  );
}
