"use client";

// 구매자 요청 관리 (PRD 9번 화면 4): 열람 요청 승인·거절, NDA 상태, 양수인 AI 질문(직접 답하기), 열람 기록

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import { ACCESS_LABEL, AGENT_STATUS_LABEL, ANSWER_TYPE_LABEL, AUDIT_LABEL, customTopicsLabel, TOPIC_LABEL } from "@/lib/labels";
import type { AccessLevel, GrantStatus } from "@/lib/types";

type Grant = {
  id: string;
  created_at: string;
  buyer_id: string;
  target_type: "document" | "document_summary";
  target_id: string;
  status: GrantStatus;
  reason: string | null;
  decided_at: string | null;
  expires_at: string | null;
};
type Nda = { buyer_id: string; status: string; version: string; agreed_at: string; revoked_at: string | null };
type Question = {
  id: string;
  created_at: string;
  updated_at: string;
  buyer_id: string;
  question_type: string;
  topic: string;
  question: string;
  status: string;
  answer_type: string | null;
  answer: string | null;
  grant_id: string | null;
};
type Log = { created_at: string; actor_id: string | null; action: string; target: string | null };
type Doc = { id: string; file_name: string; kind: string; access_level: AccessLevel; summary_access_level: AccessLevel };
type RequestsResponse = { grants: Grant[]; ndas: Nda[]; questions: Question[]; logs: Log[]; documents: Doc[]; users: { id: string; name: string }[] };

const GRANT_LABEL: Record<GrantStatus, string> = { requested: "승인 대기", approved: "승인됨", rejected: "거절", revoked: "회수됨" };
const GRANT_TONE: Record<GrantStatus, "caution" | "outline" | "warn" | "muted"> = { requested: "caution", approved: "outline", rejected: "warn", revoked: "muted" };

export default function RequestsView({ id }: { id: string }) {
  const user = useUser();
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<RequestsResponse>(`/api/listings/${id}/requests`)
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => (setData(null), setError(e.message)));
  }, [id]);
  useEffect(load, [load, user.id]);

  async function decide(grant: Grant, action: "approve" | "reject" | "revoke") {
    setBusy(grant.id + action);
    try {
      await apiFetch(`/api/grants/${grant.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function reply(q: Question, answer: string) {
    setBusy(q.id + "reply");
    try {
      await apiFetch(`/api/agent/messages/${q.id}/reply`, { method: "POST", body: JSON.stringify({ answer }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "답하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="mx-auto max-w-6xl rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!data) return <p className="text-sm text-muted">불러오는 중...</p>;

  const name = (uid: string | null) => data.users.find((u) => u.id === uid)?.name ?? "알 수 없음";
  const doc = (docId: string) => data.documents.find((d) => d.id === docId);
  const ndaOf = (buyerId: string) => data.ndas.find((n) => n.buyer_id === buyerId);
  const pending = data.grants.filter((g) => g.status === "requested").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href={`/listings/${id}`} className="text-sm text-muted hover:text-text">
          ← 데이터룸으로
        </Link>
        <h1 className="mt-1 text-xl font-bold">구매자 요청 관리</h1>
        <p className="text-sm text-muted">승인한 자료만 그 양수인과 양수인의 AI 에이전트가 볼 수 있어요. 승인은 30일 뒤 만료되고, 언제든 회수할 수 있어요.</p>
      </div>
      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}

      <Section title={`열람 요청 (승인 대기 ${pending})`}>
        {data.grants.length === 0 ? (
          <Empty>아직 열람 요청이 없어요.</Empty>
        ) : (
          <Table head={["요청한 사람", "자료", "공개 등급", "NDA", "요청 이유", "상태", "요청 시각", ""]}>
            {data.grants.map((g) => {
              const d = doc(g.target_id);
              const level = g.target_type === "document" ? d?.access_level : d?.summary_access_level;
              const nda = ndaOf(g.buyer_id);
              const question = data.questions.find((q) => q.grant_id === g.id);
              return (
                <tr key={g.id} className="border-t border-bg align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{name(g.buyer_id)}</td>
                  <td className="px-4 py-3">
                    {d?.file_name ?? "삭제된 자료"} · {g.target_type === "document" ? "원본" : "요약"}
                    {question && <span className="mt-1 block text-xs text-muted">AI 질문: {question.question}</span>}
                  </td>
                  <td className="px-4 py-3">{level && <Tag>{ACCESS_LABEL[level]}</Tag>}</td>
                  <td className="px-4 py-3">{nda?.status === "test_agreed" ? <Tag tone="outline">테스트 동의</Tag> : <Tag tone="warn">미동의</Tag>}</td>
                  <td className="px-4 py-3 text-muted">{g.reason ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Tag tone={GRANT_TONE[g.status]}>{GRANT_LABEL[g.status]}</Tag>
                    {g.expires_at && g.status === "approved" && <span className="mt-1 block text-xs text-muted">~{formatTime(g.expires_at)}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatTime(g.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {g.status === "requested" && (
                      <span className="flex gap-3">
                        <button type="button" disabled={!!busy} onClick={() => decide(g, "approve")} className="font-medium text-accent disabled:opacity-50">
                          {busy === g.id + "approve" ? "승인 중..." : "승인"}
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => decide(g, "reject")} className="text-warn disabled:opacity-50">
                          거절
                        </button>
                      </span>
                    )}
                    {g.status === "approved" && (
                      <button type="button" disabled={!!busy} onClick={() => decide(g, "revoke")} className="text-muted disabled:opacity-50">
                        권한 회수
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title={`양수인 AI가 보낸 질문 (${data.questions.length})`}>
        <p className="mb-2 text-xs text-muted">
          &quot;추가 자료 요청&quot; 질문은{" "}
          <Link href={`/listings/${id}`} className="text-accent">
            데이터룸
          </Link>
          에 자료를 올리면 내 AI가 자동으로 다시 답해요. 자료 없이 글로 직접 답할 수도 있어요 (양수인에게는 &quot;점주 진술&quot;로 보여요).
        </p>
        {data.questions.length === 0 ? (
          <Empty>아직 받은 AI 질문이 없어요.</Empty>
        ) : (
          <Table head={["보낸 사람", "주제", "질문", "상태", "내 AI의 답", "시각"]}>
            {data.questions.map((q) => (
              <tr key={q.id} className="border-t border-bg align-top">
                <td className="px-4 py-3 whitespace-nowrap">{name(q.buyer_id)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {q.question_type.startsWith("custom") ? (
                    <>
                      <Tag tone="outline">양수인 직접 질문</Tag>
                      <span className="mt-1 block text-xs text-muted">{customTopicsLabel(q.question_type) || "자료 범위 밖"}</span>
                    </>
                  ) : (
                    (TOPIC_LABEL[q.topic] ?? q.topic)
                  )}
                </td>
                <td className="px-4 py-3">{q.question}</td>
                <td className="px-4 py-3">
                  <Tag tone={q.status === "answered" ? "outline" : q.status === "error" || q.status === "rejected" ? "warn" : "caution"}>
                    {AGENT_STATUS_LABEL[q.status] ?? q.status}
                  </Tag>
                  {q.answer_type && <span className="mt-1 block text-xs text-muted">{ANSWER_TYPE_LABEL[q.answer_type] ?? q.answer_type}</span>}
                </td>
                <td className="px-4 py-3 text-muted">
                  {q.answer ?? "-"}
                  {(q.status === "needs_documents" || q.status === "error" || (q.question_type.replace(/^custom:/, "").split(",").includes("seller") && q.answer_type === "auto" && !q.answer?.includes("양도인 직접 답변"))) && <ReplyBox busy={busy === q.id + "reply"} onSend={(text) => reply(q, text)} />}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatTime(q.updated_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="NDA 현황">
        {data.ndas.length === 0 ? (
          <Empty>아직 NDA에 동의한 양수인이 없어요.</Empty>
        ) : (
          <Table head={["양수인", "상태", "문서 버전", "동의 시각", "철회 시각"]}>
            {data.ndas.map((n) => (
              <tr key={n.buyer_id} className="border-t border-bg">
                <td className="px-4 py-3">{name(n.buyer_id)}</td>
                <td className="px-4 py-3">{n.status === "test_agreed" ? <Tag tone="outline">테스트 동의 (법적 효력 없음)</Tag> : <Tag>철회</Tag>}</td>
                <td className="px-4 py-3 text-muted">{n.version}</td>
                <td className="px-4 py-3 text-muted">{formatTime(n.agreed_at)}</td>
                <td className="px-4 py-3 text-muted">{n.revoked_at ? formatTime(n.revoked_at) : "-"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="열람·권한 기록 (최근 50건)">
        {data.logs.length === 0 ? (
          <Empty>아직 기록이 없어요.</Empty>
        ) : (
          <Table head={["시각", "누가", "무엇을", "대상"]}>
            {data.logs.map((log, i) => (
              <tr key={i} className="border-t border-bg">
                <td className="px-4 py-2 whitespace-nowrap text-muted">{formatTime(log.created_at)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{name(log.actor_id)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{AUDIT_LABEL[log.action] ?? log.action}</td>
                <td className="px-4 py-2 text-muted">{log.target ?? "-"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function ReplyBox({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 block text-xs font-medium text-accent">
        직접 답하기
      </button>
    );
  }
  return (
    <span className="mt-2 block space-y-1.5">
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder="양수인에게 보낼 답을 적어주세요" className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text" />
      <span className="flex gap-3 text-xs">
        <button type="button" disabled={busy || !text.trim()} onClick={() => onSend(text)} className="font-medium text-accent disabled:opacity-50">
          {busy ? "보내는 중..." : "답 보내기"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted">
          취소
        </button>
      </span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">{children}</p>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
