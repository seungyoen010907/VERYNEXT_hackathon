"use client";

// 거래방 메시지. 처음에 전부 불러오고, 3초마다 GET /api/deals/[id]/messages?after=마지막 시각 으로 새 것만 가져온다.
// basePath = "/api/deals/[id]/messages" (+ 양도인이면 ?buyer=)

import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL } from "@/components/RoleSwitch";
import { apiFetch } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import type { Message, Role } from "@/lib/types";

const POLL_MS = 3000;

export default function Messages({ listingId, buyerQuery, role }: { listingId: string; buyerQuery: string; role: Role }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastAt = useRef<string | null>(null);

  const url = (extra = "") => {
    const params = new URLSearchParams(buyerQuery);
    if (extra) params.set("after", extra);
    const qs = params.toString();
    return `/api/deals/${listingId}/messages${qs ? `?${qs}` : ""}`;
  };

  // 새 메시지만 합친다 (보낸 직후 폴링과 겹쳐도 id로 중복 제거).
  // '마지막 시각'은 폴링 결과로만 옮긴다. 내가 보낸 메시지 시각으로 옮기면 그 사이 상대 메시지를 놓칠 수 있다.
  function merge(incoming: Message[]) {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
    });
  }

  useEffect(() => {
    // 사용자·거래방이 바뀌면 DealRoom이 key로 이 컴포넌트를 새로 만든다 (상태 초기화)
    let stop = false;

    async function poll() {
      try {
        const data = await apiFetch<{ messages: Message[] }>(url(lastAt.current ?? ""));
        if (stop) return;
        merge(data.messages);
        if (data.messages.length) lastAt.current = data.messages[data.messages.length - 1].created_at;
        setLoaded(true);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "메시지를 불러오지 못했어요.");
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, buyerQuery]);

  // 새 메시지가 생기면 맨 아래로 스크롤
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch<{ message: Message }>(url(), { method: "POST", body: JSON.stringify({ body: text }) });
      merge([data.message]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "보내지 못했어요.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ul ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 md:px-6">
        {!loaded && !error && <li className="text-sm text-muted">불러오는 중...</li>}
        {loaded && messages.length === 0 && <li className="text-sm text-muted">아직 메시지가 없어요.</li>}
        {messages.map((m) => {
          if (m.role === "agent") {
            return (
              <li key={m.id} className="rounded-xl bg-bg px-3 py-2 text-center text-sm text-muted">
                <span className="font-medium">{ROLE_LABEL.agent}</span> · {m.body}
              </li>
            );
          }
          const mine = m.role === role;
          return (
            <li key={m.id} className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <span className="mb-1 text-xs text-muted">
                {ROLE_LABEL[m.role]} · {formatTime(m.created_at)}
              </span>
              <p
                className={
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm break-words whitespace-pre-wrap " +
                  (mine ? "bg-accent text-white" : "bg-bg")
                }
              >
                {m.body}
              </p>
            </li>
          );
        })}
      </ul>
      {error && <p className="px-4 pb-2 text-sm text-warn md:px-6">{error}</p>}
      {/* 입력칸: 데스크톱은 패널 맨 아래, 모바일은 화면 아래에 붙어 따라온다 */}
      <form onSubmit={send} className="sticky bottom-0 flex shrink-0 gap-2 rounded-b-2xl bg-card px-4 py-4 md:px-6">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder={`${ROLE_LABEL[role]}으로 메시지 보내기`}
          className="min-w-0 flex-1 rounded-lg bg-bg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!body.trim() || sending}
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? "보내는 중..." : "보내기"}
        </button>
      </form>
    </div>
  );
}
