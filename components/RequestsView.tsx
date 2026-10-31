"use client";

// 구매자 요청 관리 (PRD 9번 화면 4): 열람 요청 승인·거절, NDA 상태, 양수인 AI 질문, 열람 기록

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import { ACCESS_LABEL, AGENT_STATUS_LABEL, ANSWER_TYPE_LABEL, AUDIT_LABEL, TOPIC_LABEL } from "@/lib/labels";
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

const GRANT_LABEL: Record<GrantStatus, string> = { requested: "승인 기다리는 중", approved: "승인함", rejected: "거절함", revoked: "열람 취소함" };
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
          ← 자료실로
        </Link>
        <h1 className="mt-1 text-xl font-bold">받은 요청</h1>
        <p className="text-sm text-muted">승인하면 그 양수인만 볼 수 있어요. 승인은 30일 동안 유효하고, 언제든 취소할 수 있어요.</p>
      </div>
      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}

      <Section title={`열람 요청 · 처리할 요청 ${pending}개`}>
        {data.grants.length === 0 ? (
          <Empty>아직 열람 요청이 없어요.</Empty>
        ) : (
          <Table head={["요청한 사람", "자료", "공개 범위", "NDA", "요청 이유", "상태", "요청 시각", ""]}>
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
                    {question && <span className="mt-1 block text-xs text-muted">물어본 것: {question.question}</span>}
                  </td>
                  <td className="px-4 py-3">{level && <Tag>{ACCESS_LABEL[level]}</Tag>}</td>
                  <td className="px-4 py-3">{nda?.status === "test_agreed" ? <Tag tone="outline">동의함</Tag> : <Tag tone="warn">동의 전</Tag>}</td>
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
                        열람 취소
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title={`양수인 AI가 물어본 것 ${data.questions.length}개`}>
        {data.questions.length === 0 ? (
          <Empty>아직 받은 AI 질문이 없어요.</Empty>
        ) : (
          <Table head={["물어본 사람", "주제", "질문", "상태", "양도인 AI의 답", "시각"]}>
            {data.questions.map((q) => (
              <tr key={q.id} className="border-t border-bg align-top">
                <td className="px-4 py-3 whitespace-nowrap">{name(q.buyer_id)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{TOPIC_LABEL[q.topic] ?? q.topic}</td>
                <td className="px-4 py-3">{q.question}</td>
                <td className="px-4 py-3">
                  <Tag tone={q.status === "answered" ? "outline" : q.status === "error" || q.status === "rejected" ? "warn" : "caution"}>
                    {AGENT_STATUS_LABEL[q.status] ?? q.status}
                  </Tag>
                  {q.answer_type && <span className="mt-1 block text-xs text-muted">{ANSWER_TYPE_LABEL[q.answer_type] ?? q.answer_type}</span>}
                </td>
                <td className="px-4 py-3 text-muted">{q.answer ?? "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatTime(q.updated_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="NDA 동의한 양수인">
        {data.ndas.length === 0 ? (
          <Empty>아직 NDA에 동의한 양수인이 없어요.</Empty>
        ) : (
          <Table head={["양수인", "상태", "문서 버전", "동의 시각", "철회 시각"]}>
            {data.ndas.map((n) => (
              <tr key={n.buyer_id} className="border-t border-bg">
                <td className="px-4 py-3">{name(n.buyer_id)}</td>
                <td className="px-4 py-3">{n.status === "test_agreed" ? <Tag tone="outline">NDA 동의 (시연용 · 법적 효력 없음)</Tag> : <Tag>철회</Tag>}</td>
                <td className="px-4 py-3 text-muted">{n.version}</td>
                <td className="px-4 py-3 text-muted">{formatTime(n.agreed_at)}</td>
                <td className="px-4 py-3 text-muted">{n.revoked_at ? formatTime(n.revoked_at) : "-"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="누가 언제 봤나요? (최근 50건)">
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
