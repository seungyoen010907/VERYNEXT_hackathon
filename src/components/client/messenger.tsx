"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DEAL_STAGE_LABELS,
  DEAL_TASK_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  FINDING_CERTAINTY_LABELS,
  type DealEvidence,
  type DealStage,
  type DocumentType,
  type FindingCertainty,
  type RiskLevel,
} from "@/types/domain";
import { dateTime, fileSize } from "@/lib/format";
import { RiskBadge } from "../status";
import { Badge, Button, Notice, cx, inputClass } from "../ui";
import { api } from "./api";

export interface ChatMessage {
  id: string;
  seq: number;
  senderId: string | null;
  senderName: string | null;
  senderRole: "seller" | "buyer" | null;
  kind: "text" | "file" | "request" | "system";
  body: string;
  createdAt: string;
  document: { id: string; fileName: string; documentType: DocumentType; status: string; fileSize: number; mimeType: string } | null;
}

export interface PanelFinding {
  id: string;
  key: string;
  level: RiskLevel;
  title: string;
  detail: string;
  certainty: FindingCertainty;
  evidence: DealEvidence[];
  status: "open" | "resolved";
}

export interface PanelRun {
  id: string;
  createdAt: string;
  summary: string;
  fromSeq: number | null;
  toSeq: number | null;
  trigger: string;
  result: {
    verifiedFacts: string[];
    questions: Array<{ text: string; reason: string; evidence: DealEvidence[] }>;
    requests: Array<{ taskKey: string; title: string; reason: string; period: string | null }>;
    requestMessage: string | null;
    stageSuggestion: { stage: DealStage; reason: string } | null;
    resolvedKeys: string[];
    taskUpdates: Array<{ taskKey: string; to: string; note: string }>;
  };
}

export interface PanelEligibility {
  eligible: boolean;
  reasons: string[];
  newMessages: number;
  threshold: number;
  newDocuments: Array<{ id: string; fileName: string }>;
  pendingDocuments: number;
  upToDate: boolean;
}

interface AiMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  cited: DealEvidence[];
  createdAt: string;
}

interface Props {
  dealId: string;
  myId: string;
  role: "seller" | "buyer";
  counterpartName: string;
  closed: boolean;
  stage: DealStage;
  aiAutoRun: boolean;
  initialMessages: ChatMessage[];
  eligibility: PanelEligibility;
  latestRun: PanelRun | null;
  findings: PanelFinding[];
  openTasks: Array<{ id: string; key: string; title: string; status: string; requestTargetRole: string | null }>;
  aiMessages: AiMsg[];
}

const BUYER_QUESTIONS = ["지금까지 거래에서 발견된 위험을 정리해 줘", "양도인이 주장한 매출이 실제 자료와 일치해?", "아직 제출되지 않은 자료가 뭐야?", "추가로 어떤 질문을 해야 해?", "권리금과 예상 수익을 비교해 줘", "현재 인수 위험을 종합적으로 평가해 줘", "다음에 해야 할 실사 업무를 알려줘"];
const SELLER_QUESTIONS = ["아직 제출하지 않은 자료가 뭐야?", "다음에 해야 할 업무를 알려줘"];

function scrollToSeq(seq: number | null | undefined) {
  if (!seq) return;
  const el = document.getElementById(`msg-${seq}`);
  if (!el) return;
  void el.scrollIntoView({ block: "center" });
  el.classList.add("ring-2", "ring-amber-400");
  setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1600);
}

function EvidenceLinks({ evidence, dealId }: { evidence: DealEvidence[]; dealId: string }) {
  if (evidence.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      <span className="text-neutral-500">근거</span>
      {evidence.slice(0, 4).map((e, i) =>
        e.kind === "message" && e.seq ? (
          <button key={i} type="button" onClick={() => scrollToSeq(e.seq)} className="text-blue-800 underline underline-offset-2">
            메시지 #{e.seq}
          </button>
        ) : e.kind === "document" && e.id ? (
          <a key={i} href={`/api/documents/${e.id}?download=1`} target="_blank" rel="noreferrer" className="max-w-48 truncate text-blue-800 underline underline-offset-2">
            {e.label}
          </a>
        ) : e.kind === "analysis" ? (
          <Link key={i} href={`/deals/${dealId}?tab=analysis`} className="text-blue-800 underline underline-offset-2">
            {e.label}
          </Link>
        ) : (
          <span key={i} className="max-w-48 truncate text-neutral-600">
            {e.label}
          </span>
        ),
      )}
    </span>
  );
}

export function Messenger(props: Props) {
  const { dealId, myId, role } = props;
  const router = useRouter();
  // 서버가 그린 메시지 + 이 화면에서 받은 메시지(전송·새 메시지 확인)를 순번 기준으로 합친다
  const [local, setMessages] = useState<ChatMessage[]>([]);
  const messages = useMemo(() => {
    const bySeq = new Map<number, ChatMessage>();
    for (const m of [...local, ...props.initialMessages]) bySeq.set(m.seq, m);
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  }, [local, props.initialMessages]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>(role === "seller" ? "pos_sales" : "other");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSeq = messages.at(-1)?.seq ?? 0;

  const scrollBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    scrollBottom();
  }, [messages.length, scrollBottom]);

  // 새 메시지 확인 (5초 간격). 실시간 소켓 없이 동작한다.
  useEffect(() => {
    if (props.closed) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const fresh = await api<ChatMessage[]>(`/api/deals/${dealId}/messages?after=${lastSeq}`);
        if (fresh.length > 0) {
          setMessages((cur) => [...cur, ...fresh.filter((f) => !cur.some((c) => c.seq === f.seq))]);
          await api(`/api/deals/${dealId}/read`, { method: "POST" });
          router.refresh();
        }
      } catch {
        /* 다음 주기에 다시 시도 */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [dealId, lastSeq, props.closed, router]);

  async function send(e?: FormEvent, opts: { kind?: "text" | "request"; body?: string; taskKeys?: string[] } = {}) {
    e?.preventDefault();
    const body = (opts.body ?? text).trim();
    if (!body && !file) return;
    setSending(true);
    setError(null);
    setFileNote(null);
    try {
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("documentType", docType);
        fd.set("body", body);
        const r = await api<{ message: ChatMessage; analysis: { revenueCount: number; expenseCount: number; warnings: string[] } | null; analysisError: string | null; duplicateOf: string[] }>(
          `/api/deals/${dealId}/files`,
          { method: "POST", body: fd },
        );
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setFileNote(
          r.analysis
            ? `문서 분석 완료 (매출 ${r.analysis.revenueCount}건, 비용 ${r.analysis.expenseCount}건${r.analysis.warnings.length ? `, 경고 ${r.analysis.warnings.length}건` : ""}). 증빙자료에도 저장되었습니다.`
            : r.analysisError
              ? `파일은 공유·저장되었지만 문서 분석은 하지 않았습니다: ${r.analysisError}`
              : r.duplicateOf.length
                ? "같은 내용의 파일이 이미 있어 중복 가능성으로 표시했습니다."
                : "파일을 공유했습니다.",
        );
      } else {
        const m = await api<ChatMessage>(`/api/deals/${dealId}/messages`, { method: "POST", json: { body, kind: opts.kind ?? "text", taskKeys: opts.taskKeys ?? [] } });
        setMessages((cur) => (cur.some((c) => c.seq === m.seq) ? cur : [...cur, { ...m, senderName: "나", senderRole: role, document: null }]));
      }
      if (!opts.body) setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 lg:hidden">
        <Button variant={mobilePanel ? "secondary" : "primary"} onClick={() => setMobilePanel(false)} className="flex-1">
          대화
        </Button>
        <Button variant={mobilePanel ? "primary" : "secondary"} onClick={() => setMobilePanel(true)} className="flex-1">
          {role === "buyer" ? "AI 분석 · 업무" : "요청 자료 · AI"}
          {props.eligibility.eligible && <span className="ml-1 size-1.5 rounded-full bg-red-600" />}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 대화 */}
        <section className={cx("flex min-w-0 flex-col rounded-sm border border-neutral-200 bg-white", mobilePanel && "hidden lg:flex")} aria-label="거래 대화">
          <div ref={listRef} className="h-[calc(100vh-340px)] min-h-[420px] space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => {
              if (m.kind === "system") {
                return (
                  <div key={m.id} id={`msg-${m.seq}`} className="mx-auto max-w-xl rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-center text-[12px] text-neutral-600">
                    {m.body}
                    <span className="ml-2 text-[11px] text-neutral-400">{dateTime(m.createdAt)}</span>
                  </div>
                );
              }
              const mine = m.senderId === myId;
              return (
                <div key={m.id} id={`msg-${m.seq}`} className={cx("flex scroll-mt-20 rounded-sm", mine ? "justify-end" : "justify-start")}>
                  <div className={cx("max-w-[78%]", mine && "text-right")}>
                    <p className="mb-0.5 text-[11px] text-neutral-500">
                      <span className="font-medium text-neutral-700">{mine ? "나" : m.senderName}</span>
                      {m.senderRole && <span className="ml-1">({m.senderRole === "seller" ? "양도인" : "양수인"})</span>}
                      <span className="ml-1.5">{dateTime(m.createdAt)}</span>
                      <span className="ml-1.5 text-neutral-400">#{m.seq}</span>
                    </p>
                    <div
                      className={cx(
                        "inline-block rounded-md border px-3 py-2 text-left text-[13px] leading-relaxed",
                        mine ? "border-neutral-800 bg-neutral-900 text-white" : "border-neutral-200 bg-neutral-50 text-neutral-900",
                        m.kind === "request" && (mine ? "border-amber-500" : "border-amber-300 bg-amber-50"),
                      )}
                    >
                      {m.kind === "request" && <span className={cx("mb-1 block text-[11px] font-semibold", mine ? "text-amber-300" : "text-amber-800")}>자료 요청</span>}
                      {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                      {m.kind === "file" && !m.document && <p className="mt-1 text-[12px] opacity-70">[삭제된 파일]</p>}
                      {m.document && (
                        <a
                          href={`/api/documents/${m.document.id}?download=1`}
                          target="_blank"
                          rel="noreferrer"
                          className={cx("mt-1 flex items-center gap-2 rounded-sm border px-2 py-1.5 text-[12px]", mine ? "border-neutral-600 hover:bg-neutral-800" : "border-neutral-300 bg-white hover:bg-neutral-50")}
                        >
                          <span className={cx("rounded-sm px-1 text-[10px] font-semibold", mine ? "bg-neutral-700" : "bg-neutral-200")}>{m.document.mimeType.includes("pdf") ? "PDF" : m.document.mimeType.includes("image") ? "IMG" : "XLS"}</span>
                          <span className="min-w-0 flex-1 truncate">{m.document.fileName}</span>
                          <span className="whitespace-nowrap opacity-70">
                            {DOCUMENT_TYPE_LABELS[m.document.documentType]} · {fileSize(m.document.fileSize)} · {m.document.status === "analyzed" ? "분석 완료" : m.document.status === "failed" ? "분석 실패" : m.document.documentType === "other" ? "참고 자료" : "분석 대기"}
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {props.closed ? (
            <div className="border-t border-neutral-200 px-4 py-3 text-[12px] text-neutral-500">종료된 거래입니다. 이전 대화는 계속 볼 수 있습니다.</div>
          ) : (
            <form onSubmit={(e) => send(e)} className="space-y-2 border-t border-neutral-200 px-3 py-3">
              {file && (
                <div className="flex flex-wrap items-center gap-2 rounded-sm border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">첨부: {file.name} ({fileSize(file.size)})</span>
                  {role === "seller" ? (
                    <select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)} className="h-7 rounded-sm border border-neutral-300 bg-white px-1.5 text-[12px]" aria-label="자료 종류">
                      {DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DOCUMENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-neutral-500">참고 자료로 공유 (매물 분석에는 포함되지 않음)</span>
                  )}
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-neutral-500 underline">
                    취소
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-sm border border-neutral-300 bg-white px-2.5 text-[13px] text-neutral-700 hover:bg-neutral-50">
                  파일
                  <input ref={fileRef} type="file" accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  maxLength={5000}
                  placeholder={`${props.counterpartName}에게 메시지 (Enter 전송, Shift+Enter 줄바꿈)`}
                  className={`${inputClass} h-9 min-h-9 resize-y py-2`}
                />
                <Button type="submit" variant="primary" className="h-9" disabled={sending || (!text.trim() && !file)}>
                  {sending ? "전송 중" : "전송"}
                </Button>
              </div>
              {error && <p className="text-[12px] text-red-700">{error}</p>}
              {fileNote && <p className="text-[12px] text-neutral-600">{fileNote}</p>}
            </form>
          )}
        </section>

        {/* AI 분석 · 업무 패널 */}
        <aside className={cx("min-w-0 space-y-3", !mobilePanel && "hidden lg:block")} aria-label="AI 분석과 업무">
          {role === "buyer" ? (
            <BuyerPanel {...props} onUseQuestion={(q) => setText(q)} onSendRequest={(body, keys) => send(undefined, { kind: "request", body, taskKeys: keys })} />
          ) : (
            <SellerPanel {...props} />
          )}
          <AiAsk dealId={dealId} initial={props.aiMessages} suggestions={role === "buyer" ? BUYER_QUESTIONS : SELLER_QUESTIONS} />
        </aside>
      </div>
    </div>
  );
}

function PanelBlock({ title, right, children, defaultOpen = true }: { title: string; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-sm border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13px] font-semibold">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-[11px] font-normal text-neutral-500">
          {right}
          <span className="group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="border-t border-neutral-100 px-3 py-2.5">{children}</div>
    </details>
  );
}

function BuyerPanel(props: Props & { onUseQuestion: (q: string) => void; onSendRequest: (body: string, keys: string[]) => void }) {
  const { dealId, eligibility: e, latestRun, findings } = props;
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [auto, setAuto] = useState(props.aiAutoRun);
  const [draft, setDraft] = useState<string | null>(null);
  const open = findings.filter((f) => f.status === "open");
  const resolved = findings.filter((f) => f.status === "resolved" && latestRun?.result.resolvedKeys.includes(f.key));

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      await api(`/api/deals/${dealId}/analysis`, { method: "POST", json: {} });
      router.refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "분석하지 못했습니다.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <section className="rounded-sm border border-neutral-300 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
          <h3 className="text-[13px] font-semibold">AI 거래 분석</h3>
          {e.eligible ? <Badge tone="caution">분석 가능</Badge> : e.upToDate ? <Badge tone="positive">최신</Badge> : <Badge tone="muted">대기</Badge>}
        </div>
        <div className="space-y-2 px-3 py-2.5 text-[12px]">
          <div>
            <div className="flex justify-between text-neutral-600">
              <span>새 메시지 (마지막 분석 이후)</span>
              <span className="tabular-nums">
                {e.newMessages} / {e.threshold}
              </span>
            </div>
            <div className="mt-1 h-1.5 bg-neutral-200">
              <div className="h-full bg-neutral-800" style={{ width: `${Math.min(100, (e.newMessages / e.threshold) * 100)}%` }} />
            </div>
          </div>
          <p className="text-neutral-600">
            분석 완료된 새 증빙자료 {e.newDocuments.length}건{e.pendingDocuments > 0 && ` · 문서 분석 대기 ${e.pendingDocuments}건`}
          </p>
          {e.reasons.length > 0 && <p className="text-neutral-800">실행 조건 충족: {e.reasons.join(", ")}</p>}
          <Button variant="primary" className="w-full" disabled={!e.eligible || running} onClick={run}>
            {running ? "분석 중…" : e.upToDate ? "새 대화·자료 없음" : e.eligible ? "AI 거래 분석 실행" : `메시지 ${Math.max(0, e.threshold - e.newMessages)}건 더 필요 (또는 새 증빙자료)`}
          </Button>
          {runError && <p className="text-red-700">{runError}</p>}
          <label className="flex items-center gap-2 text-neutral-600">
            <input
              type="checkbox"
              checked={auto}
              className="size-3.5 accent-neutral-900"
              onChange={async (ev) => {
                setAuto(ev.target.checked);
                await api(`/api/deals/${dealId}/settings`, { method: "PATCH", json: { aiAutoRun: ev.target.checked } }).catch(() => setAuto(!ev.target.checked));
              }}
            />
            조건 충족 시 자동 분석 (기본: 꺼짐)
          </label>
          {latestRun && (
            <p className="border-t border-neutral-100 pt-2 text-neutral-700">
              <span className="text-neutral-500">마지막 분석 {dateTime(latestRun.createdAt)} · 메시지 {latestRun.fromSeq ? `#${latestRun.fromSeq + 1}` : "처음"}~#{latestRun.toSeq}</span>
              <span className="mt-0.5 block">{latestRun.summary}</span>
            </p>
          )}
        </div>
      </section>

      {latestRun && (
        <>
          <PanelBlock title="발견된 위험 · 확인 필요" right={`${open.length}건`}>
            {open.length === 0 ? (
              <p className="text-[12px] text-neutral-500">열린 위험 항목이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {open.slice(0, 8).map((f) => (
                  <li key={f.id} className="py-2 text-[12px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RiskBadge level={f.level} />
                      <span className="text-[11px] text-neutral-500">{FINDING_CERTAINTY_LABELS[f.certainty]}</span>
                    </div>
                    <p className="mt-1 font-medium text-neutral-900">{f.title}</p>
                    <p className="mt-0.5 leading-relaxed text-neutral-700">{f.detail}</p>
                    <EvidenceLinks evidence={f.evidence} dealId={dealId} />
                  </li>
                ))}
              </ul>
            )}
            {open.length > 8 && (
              <Link href={`/deals/${dealId}?tab=tasks`} className="mt-1 block text-[12px] underline">
                전체 {open.length}건 보기
              </Link>
            )}
            {resolved.length > 0 && <p className="mt-2 border-t border-neutral-100 pt-2 text-[12px] text-emerald-800">이번 분석에서 해결됨: {resolved.map((r) => r.title).join(", ")}</p>}
          </PanelBlock>

          {latestRun.result.requests.length > 0 && (
            <PanelBlock title="AI 제안: 자료 요청" right={`${latestRun.result.requests.length}건`}>
              <ul className="space-y-1 text-[12px]">
                {latestRun.result.requests.map((r) => (
                  <li key={r.taskKey}>
                    <span className="font-medium">{r.title}</span>
                    {r.period && <span className="text-neutral-500"> · {r.period}</span>}
                    <span className="block text-neutral-600">{r.reason}</span>
                  </li>
                ))}
              </ul>
              {draft === null ? (
                <Button className="mt-2 w-full" onClick={() => setDraft(latestRun.result.requestMessage ?? "")}>
                  요청문 검토 후 보내기
                </Button>
              ) : (
                <div className="mt-2 space-y-2">
                  <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={8} className={`${inputClass} h-auto py-2 text-[12px]`} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => setDraft(null)}>
                      취소
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={!draft.trim()}
                      onClick={() => {
                        props.onSendRequest(draft, latestRun.result.requests.map((r) => r.taskKey));
                        setDraft(null);
                      }}
                    >
                      양도인에게 전송
                    </Button>
                  </div>
                  <p className="text-[11px] text-neutral-500">AI는 직접 메시지를 보내지 않습니다. 내용을 확인·수정한 뒤 전송하세요.</p>
                </div>
              )}
            </PanelBlock>
          )}

          {latestRun.result.questions.length > 0 && (
            <PanelBlock title="AI 제안: 추가 질문" right={`${latestRun.result.questions.length}건`} defaultOpen={false}>
              <ul className="space-y-1.5 text-[12px]">
                {latestRun.result.questions.map((q, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => props.onUseQuestion(q.text)} className="text-left text-neutral-900 hover:underline">
                      {q.text}
                    </button>
                    <span className="block text-[11px] text-neutral-500">
                      {q.reason} · 누르면 입력창에 넣습니다
                    </span>
                  </li>
                ))}
              </ul>
            </PanelBlock>
          )}

          {(latestRun.result.verifiedFacts.length > 0 || latestRun.result.stageSuggestion) && (
            <PanelBlock title="확인된 사항 · 단계 제안" defaultOpen={false}>
              <ul className="list-disc space-y-1 pl-4 text-[12px] text-neutral-700">
                {latestRun.result.verifiedFacts.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
              {latestRun.result.stageSuggestion && (
                <p className="mt-2 text-[12px]">
                  다음 단계 제안: <strong>{DEAL_STAGE_LABELS[latestRun.result.stageSuggestion.stage]}</strong> ({latestRun.result.stageSuggestion.reason}) · 단계는 상단에서 직접 변경합니다.
                </p>
              )}
            </PanelBlock>
          )}
        </>
      )}

      <PanelBlock title="미완료 업무" right={`${props.openTasks.length}건`} defaultOpen={false}>
        <ul className="space-y-1 text-[12px]">
          {props.openTasks.slice(0, 8).map((t) => (
            <li key={t.id} className="flex justify-between gap-2">
              <span className="truncate">{t.title}</span>
              <span className="whitespace-nowrap text-neutral-500">{DEAL_TASK_STATUS_LABELS[t.status as keyof typeof DEAL_TASK_STATUS_LABELS]}</span>
            </li>
          ))}
        </ul>
        <Link href={`/deals/${dealId}?tab=tasks`} className="mt-2 block text-[12px] underline">
          실사 관리에서 보기
        </Link>
      </PanelBlock>
    </>
  );
}

function SellerPanel(props: Props) {
  const requested = props.openTasks.filter((t) => t.requestTargetRole === "seller" && ["requested", "needs_more"].includes(t.status));
  return (
    <>
      <PanelBlock title="양수인이 요청한 자료" right={`${requested.length}건`}>
        {requested.length === 0 ? (
          <p className="text-[12px] text-neutral-500">요청받은 자료가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5 text-[12px]">
            {requested.map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span>{t.title}</span>
                <Badge tone={t.status === "needs_more" ? "caution" : "neutral"}>{t.status === "needs_more" ? "보완 필요" : "요청됨"}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">대화창의 &apos;파일&apos;로 자료를 올리면 증빙자료에 저장되고 문서 분석이 진행됩니다.</p>
      </PanelBlock>
      <Notice>이 대화와 공유 자료는 양수인의 AI 실사 분석에 사용됩니다. 비공개 메모는 분석과 공유 대상이 아닙니다.</Notice>
    </>
  );
}

function AiAsk({ dealId, initial, suggestions }: { dealId: string; initial: AiMsg[]; suggestions: string[] }) {
  const [msgs, setMsgs] = useState(initial);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView는 브라우저에 따라 Promise를 돌려주므로 effect에서 반환하지 않는다
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length]);
  async function ask(question: string) {
    if (!question.trim()) return;
    setPending(true);
    setError(null);
    try {
      const added = await api<AiMsg[]>(`/api/deals/${dealId}/ai-chat`, { method: "POST", json: { message: question } });
      setMsgs((m) => [...m, ...added]);
      setQ("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변을 받지 못했습니다.");
    } finally {
      setPending(false);
    }
  }
  return (
    <PanelBlock title="AI에게 질문" right="나만 보임">
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {msgs.length === 0 && <p className="text-[12px] text-neutral-500">저장된 대화와 증빙자료, 실사 분석 결과를 근거로 답합니다.</p>}
        {msgs.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="text-[12px] font-medium text-neutral-900">
              Q. {m.content}
            </p>
          ) : (
            <div key={m.id} className="border-l-2 border-neutral-800 pl-2 text-[12px] leading-relaxed text-neutral-800">
              <p className="whitespace-pre-wrap">{m.content}</p>
              <EvidenceLinks evidence={m.cited} dealId={dealId} />
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {suggestions.map((s) => (
          <button key={s} type="button" disabled={pending} onClick={() => ask(s)} className="rounded-sm border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-400">
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} placeholder="거래에 대해 질문" className={inputClass} />
        <Button type="submit" disabled={pending || !q.trim()}>
          {pending ? "…" : "질문"}
        </Button>
      </form>
      {error && <p className="mt-1 text-[12px] text-red-700">{error}</p>}
      <p className="mt-1.5 text-[11px] text-neutral-500">외부 AI 미연결: 규칙 기반 분석 엔진이 답합니다. 사기 여부나 법률적 안전성은 판단하지 않습니다.</p>
    </PanelBlock>
  );
}
