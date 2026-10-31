import Link from "next/link";
import {
  DEAL_EVENT_TYPE_LABELS,
  DEAL_TASK_GROUP_LABELS,
  DEAL_TASK_GROUPS,
  DEAL_TASK_STATUS_LABELS,
  DEAL_TERM_LABELS,
  DOCUMENT_TYPE_LABELS,
  FINDING_CERTAINTY_LABELS,
  PARTY_ROLE_LABELS,
  type DealEventType,
  type DealTaskStatus,
  type DealTerms,
} from "@/types/domain";
import { date, dateTime, fileSize, won } from "@/lib/format";
import type { DealWorkspace } from "@/server/deals/views";
import { AddTaskForm, PrivateNote, TaskDueInput, TaskStatusSelect, TermsEditor } from "../client/deal-actions";
import { ChecklistStateBadge, DocumentStatusBadge, RiskBadge } from "../status";
import { EmptyRow, Table, Td, Th, Tr } from "../table";
import { Badge, Dot, Notice, Panel, type Tone } from "../ui";

export const TASK_TONE: Record<DealTaskStatus, Tone> = {
  not_requested: "muted",
  requested: "neutral",
  submitted: "info",
  reviewing: "info",
  needs_more: "caution",
  done: "positive",
};

export function TaskStatusBadge({ status }: { status: DealTaskStatus }) {
  return <Badge tone={TASK_TONE[status]}>{DEAL_TASK_STATUS_LABELS[status]}</Badge>;
}

function fmtTerm(field: keyof DealTerms, v: unknown): string {
  if (v === null || v === undefined || v === "") return "없음";
  return field === "premium" || field === "deposit" || field === "monthlyRent" ? won(Number(v)) : String(v);
}

export function TimelineList({ items, limit }: { items: DealWorkspace["timeline"]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-neutral-500">기록이 없습니다.</p>;
  return (
    <ol className="divide-y divide-neutral-100">
      {shown.map((t) => (
        <li key={t.id} className="grid grid-cols-[124px_minmax(0,1fr)] gap-3 px-4 py-2 text-[13px]">
          <time className="whitespace-nowrap text-[12px] tabular-nums text-neutral-500">{dateTime(t.at)}</time>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] text-neutral-500">
              <Dot tone={t.type === "ai_risk_found" ? "negative" : t.type === "ai_risk_resolved" ? "positive" : t.type.startsWith("ai") ? "info" : "neutral"} />
              {t.kind === "message" ? (t.type === "request_message" ? "자료 요청 메시지" : "메시지") : DEAL_EVENT_TYPE_LABELS[t.type as DealEventType]}
              {t.actorName && <span>· {t.actorName}</span>}
            </p>
            <p className="mt-0.5 truncate text-neutral-900">{t.title}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OverviewSection({ w }: { w: DealWorkspace }) {
  const open = w.findings.filter((f) => f.status === "open");
  const openTasks = w.tasks.filter((t) => t.status !== "done");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {w.role === "buyer" && (
          <Panel title="최근 AI 분석" actions={<Link href={`/deals/${w.deal.id}?tab=chat`} className="text-[12px] underline">대화에서 보기</Link>}>
            {w.latestRun ? (
              <>
                <p className="text-[12px] text-neutral-500">
                  {dateTime(w.latestRun.createdAt)} · 메시지 {w.latestRun.fromSeq ? `#${w.latestRun.fromSeq + 1}` : "처음"}~#{w.latestRun.toSeq} · 분석 {w.runs.length}회
                </p>
                <p className="mt-1 text-[13px] leading-relaxed">{w.latestRun.summary}</p>
              </>
            ) : (
              <p className="text-[12px] text-neutral-500">
                아직 분석하지 않았습니다. 새 메시지 {w.eligibility.newMessages}/{w.eligibility.threshold}건 · 새 증빙자료 {w.eligibility.newDocuments.length}건
              </p>
            )}
            {w.eligibility.eligible && <Notice tone="caution">분석 조건 충족: {w.eligibility.reasons.join(", ")}. 대화 탭에서 실행할 수 있습니다.</Notice>}
          </Panel>
        )}

        {w.role === "buyer" && (
          <Panel title={`주요 위험 (${open.length})`} flush>
            <Table>
              <thead>
                <tr>
                  <Th>수준</Th>
                  <Th>구분</Th>
                  <Th>위험 항목</Th>
                </tr>
              </thead>
              <tbody>
                {open.length === 0 && <EmptyRow colSpan={3}>열린 위험이 없습니다.</EmptyRow>}
                {open.slice(0, 6).map((f) => (
                  <Tr key={f.id}>
                    <Td><RiskBadge level={f.level} /></Td>
                    <Td muted className="whitespace-nowrap text-[12px]">{FINDING_CERTAINTY_LABELS[f.certainty]}</Td>
                    <Td><span className="font-medium">{f.title}</span><span className="block text-[12px] text-neutral-500">{f.detail}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        )}

        <Panel title={`미완료 업무 (${openTasks.length})`} flush actions={<Link href={`/deals/${w.deal.id}?tab=tasks`} className="text-[12px] underline">실사 관리</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>업무</Th>
                <Th>분류</Th>
                <Th>요청 대상</Th>
                <Th>상태</Th>
                <Th>마감일</Th>
              </tr>
            </thead>
            <tbody>
              {openTasks.slice(0, 8).map((t) => (
                <Tr key={t.id}>
                  <Td>{t.title}</Td>
                  <Td muted>{DEAL_TASK_GROUP_LABELS[t.taskGroup]}</Td>
                  <Td muted>{t.requestTargetRole ? PARTY_ROLE_LABELS[t.requestTargetRole] : "—"}</Td>
                  <Td><TaskStatusBadge status={t.status} /></Td>
                  <Td muted>{date(t.dueDate)}</Td>
                </Tr>
              ))}
              {openTasks.length === 0 && <EmptyRow colSpan={5}>모든 업무를 완료했습니다.</EmptyRow>}
            </tbody>
          </Table>
        </Panel>

        <details className="rounded-sm border border-neutral-200 bg-white" open>
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">거래 조건 · 변경 이력 ({w.termChanges.length})</summary>
          <div className="space-y-4 border-t border-neutral-200 p-4">
            <TermsEditor dealId={w.deal.id} terms={w.deal.terms} disabled={["completed", "cancelled"].includes(w.deal.stage)} />
            {w.termChanges.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>변경 시각</Th>
                    <Th>항목</Th>
                    <Th align="right">이전 값</Th>
                    <Th align="right">변경 값</Th>
                    <Th>변경자</Th>
                  </tr>
                </thead>
                <tbody>
                  {w.termChanges.map((c) => (
                    <Tr key={c.id}>
                      <Td className="whitespace-nowrap">{dateTime(c.createdAt)}</Td>
                      <Td>{DEAL_TERM_LABELS[c.field]}</Td>
                      <Td align="right" muted>{fmtTerm(c.field, c.oldValue)}</Td>
                      <Td align="right" strong>{fmtTerm(c.field, c.newValue)}</Td>
                      <Td muted>{c.changerName ?? "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </details>
      </div>

      <div className="space-y-4">
        <Panel title="비공개 메모" description="상대방에게 보이지 않습니다">
          <PrivateNote dealId={w.deal.id} initial={w.note.body} updatedAt={w.note.updatedAt} />
        </Panel>
        <Panel title="거래 타임라인" flush>
          <TimelineList items={w.timeline} limit={12} />
          {w.timeline.length > 12 && (
            <details className="border-t border-neutral-100">
              <summary className="cursor-pointer px-4 py-2 text-[12px] text-neutral-600">전체 {w.timeline.length}건 보기</summary>
              <TimelineList items={w.timeline.slice(12)} />
            </details>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function TasksSection({ w }: { w: DealWorkspace }) {
  const eventsByTask = new Map<string, DealWorkspace["taskEvents"]>();
  for (const e of w.taskEvents) eventsByTask.set(e.taskId, [...(eventsByTask.get(e.taskId) ?? []), e]);
  const closed = ["completed", "cancelled"].includes(w.deal.stage);
  return (
    <div className="space-y-4">
      <Notice>
        상태 변경은 모두 이력에 남습니다. 자료가 올라오면 &apos;제출 완료&apos;, 문서 분석이 끝나면 &apos;검토 중&apos;으로 바뀌고, AI 분석이 근거를 붙여 &apos;완료&apos; 또는 &apos;추가 자료 필요&apos;로 바꿉니다. 직접 완료로 정한 업무는 AI가 되돌리지 않습니다.
      </Notice>
      {DEAL_TASK_GROUPS.map((g) => {
        const tasks = w.tasks.filter((t) => t.taskGroup === g);
        if (tasks.length === 0) return null;
        const done = tasks.filter((t) => t.status === "done").length;
        return (
          <details key={g} open className="rounded-sm border border-neutral-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-[13px] font-semibold">
              {DEAL_TASK_GROUP_LABELS[g]} 관련
              <span className="text-[12px] font-normal text-neutral-500">{done}/{tasks.length} 완료</span>
            </summary>
            <Table>
              <thead>
                <tr>
                  <Th>업무</Th>
                  <Th>담당</Th>
                  <Th>요청 대상</Th>
                  <Th>상태</Th>
                  <Th>마감일</Th>
                  <Th>근거 · 관련 자료</Th>
                  <Th>이력</Th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const events = eventsByTask.get(t.id) ?? [];
                  return (
                    <Tr key={t.id}>
                      <Td>
                        <span className="font-medium">{t.title}</span>
                        <span className="block text-[11px] text-neutral-500">
                          {t.reason}
                          {t.source !== "template" && ` · ${t.source === "ai" ? "AI 생성" : "직접 추가"}`}
                        </span>
                      </Td>
                      <Td muted className="whitespace-nowrap">{PARTY_ROLE_LABELS[t.assigneeRole]}</Td>
                      <Td muted className="whitespace-nowrap">{t.requestTargetRole ? PARTY_ROLE_LABELS[t.requestTargetRole] : "—"}</Td>
                      <Td>{closed ? <TaskStatusBadge status={t.status} /> : <TaskStatusSelect dealId={w.deal.id} taskId={t.id} status={t.status} />}</Td>
                      <Td>{closed ? date(t.dueDate) : <TaskDueInput dealId={w.deal.id} taskId={t.id} dueDate={t.dueDate} />}</Td>
                      <Td className="max-w-64 text-[12px]">
                        {t.evidence.length === 0 ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          t.evidence.slice(0, 3).map((e, i) =>
                            e.kind === "document" && e.id ? (
                              <a key={i} href={`/api/documents/${e.id}?download=1`} target="_blank" rel="noreferrer" className="block truncate text-blue-800 underline underline-offset-2">{e.label}</a>
                            ) : e.kind === "message" ? (
                              <Link key={i} href={`/deals/${w.deal.id}?tab=chat#msg-${e.seq}`} className="block text-blue-800 underline underline-offset-2">메시지 #{e.seq}</Link>
                            ) : (
                              <span key={i} className="block truncate text-neutral-600">{e.label}</span>
                            ),
                          )
                        )}
                      </Td>
                      <Td className="text-[12px]">
                        {events.length === 0 ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <details>
                            <summary className="cursor-pointer whitespace-nowrap text-neutral-600">{events.length}건</summary>
                            <ul className="mt-1 min-w-64 space-y-1">
                              {events.map((e) => (
                                <li key={e.id} className="text-[11px] text-neutral-700">
                                  <span className="text-neutral-500">{dateTime(e.createdAt)} · {e.actorKind === "ai" ? "AI" : e.actorKind === "system" ? "시스템" : e.actorName}</span>
                                  <span className="block">
                                    {e.fromStatus ? DEAL_TASK_STATUS_LABELS[e.fromStatus] : "—"} → {e.toStatus ? DEAL_TASK_STATUS_LABELS[e.toStatus] : "—"}
                                    {e.note && ` · ${e.note}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </details>
        );
      })}
      {!closed && (
        <Panel>
          <AddTaskForm dealId={w.deal.id} />
        </Panel>
      )}

      {w.role === "buyer" && (
        <Panel title={`AI 위험 항목 (열림 ${w.findings.filter((f) => f.status === "open").length} · 해결 ${w.findings.filter((f) => f.status === "resolved").length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>수준</Th>
                <Th>상태</Th>
                <Th>구분</Th>
                <Th>위험 항목 · 내용</Th>
                <Th>최근 확인</Th>
              </tr>
            </thead>
            <tbody>
              {w.findings.length === 0 && <EmptyRow colSpan={5}>AI 분석을 실행하면 위험 항목이 여기에 쌓입니다.</EmptyRow>}
              {w.findings.map((f) => (
                <Tr key={f.id} className={f.status === "resolved" ? "text-neutral-400" : ""}>
                  <Td><RiskBadge level={f.level} /></Td>
                  <Td>{f.status === "open" ? <Badge tone="caution">미해결</Badge> : <Badge tone="positive">해결됨</Badge>}</Td>
                  <Td className="whitespace-nowrap text-[12px]">{FINDING_CERTAINTY_LABELS[f.certainty]}</Td>
                  <Td><span className="font-medium">{f.title}</span><span className="block text-[12px]">{f.detail}</span></Td>
                  <Td className="whitespace-nowrap text-[12px]">{dateTime(f.updatedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

export function DocumentsSection({ w, storeDocs }: { w: DealWorkspace; storeDocs: Array<{ id: string; fileName: string; documentType: keyof typeof DOCUMENT_TYPE_LABELS; status: "uploaded" | "analyzing" | "analyzed" | "failed"; createdAt: string; uploaderName: string | null; fileSize: number; duplicateOfIds: string[]; replacedById: string | null; dealId: string | null }> }) {
  const shared = w.messages.filter((m) => m.document);
  const sharedIds = new Set(shared.map((m) => m.document!.id));
  const msgByDoc = new Map(shared.map((m) => [m.document!.id, m]));
  const rows = w.role === "seller" ? storeDocs : storeDocs.filter((d) => sharedIds.has(d.id));
  return (
    <div className="space-y-4">
      <Panel title="자료 제출 현황 (매물 체크리스트)" flush description={`필수 ${w.progress.checklist.requiredCount}건 중 ${w.progress.checklist.submittedCount}건 제출 · ${w.progress.checklist.completeCount}건 분석 완료`}>
        <Table>
          <thead>
            <tr>
              <Th>자료</Th>
              <Th>구분</Th>
              <Th>상태</Th>
              <Th>필요한 이유</Th>
            </tr>
          </thead>
          <tbody>
            {w.progress.checklist.items.map((i) => (
              <Tr key={i.key}>
                <Td strong>{i.label}</Td>
                <Td muted>{i.required ? "필수" : "선택"}</Td>
                <Td><ChecklistStateBadge state={i.state} required={i.required} /></Td>
                <Td className="text-[12px] text-neutral-600">{i.reason}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <Panel
        title={w.role === "seller" ? `매물 증빙자료 (${rows.length})` : `이 거래에서 공유된 자료 (${rows.length})`}
        flush
        description={w.role === "seller" ? "매물에 등록된 자료와 이 거래 대화에서 공유한 자료입니다." : "양도인이 대화에서 공유한 자료만 열람할 수 있습니다. 그 밖의 원본은 비공개입니다."}
      >
        <Table>
          <thead>
            <tr>
              <Th>파일</Th>
              <Th>종류</Th>
              <Th>업로드</Th>
              <Th>제출자</Th>
              <Th>분석 상태</Th>
              <Th>검토</Th>
              <Th>관련 대화</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>자료가 없습니다. 대화에서 파일을 첨부하면 여기에 쌓입니다.</EmptyRow>}
            {rows.map((d) => {
              const m = msgByDoc.get(d.id);
              return (
                <Tr key={d.id} className={d.replacedById ? "text-neutral-400" : ""}>
                  <Td>
                    <a href={`/api/documents/${d.id}?download=1`} target="_blank" rel="noreferrer" className="block max-w-64 truncate font-medium hover:underline">{d.fileName}</a>
                    <span className="text-[11px] text-neutral-500">{fileSize(d.fileSize)}</span>
                  </Td>
                  <Td className="whitespace-nowrap">{DOCUMENT_TYPE_LABELS[d.documentType]}</Td>
                  <Td className="whitespace-nowrap text-[12px]">{dateTime(d.createdAt)}</Td>
                  <Td className="text-[12px]">{d.uploaderName ?? "—"}</Td>
                  <Td>{d.documentType === "other" && d.status === "uploaded" ? <Badge tone="muted">참고 자료</Badge> : <DocumentStatusBadge status={d.status} />}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {d.duplicateOfIds.length > 0 && <Badge tone="caution">중복 가능성</Badge>}
                      {d.replacedById && <Badge tone="muted">재업로드로 대체됨</Badge>}
                      {d.dealId === w.deal.id && <Badge tone="neutral">대화 공유</Badge>}
                    </span>
                  </Td>
                  <Td className="text-[12px]">{m ? <Link href={`/deals/${w.deal.id}?tab=chat#msg-${m.seq}`} className="text-blue-800 underline">메시지 #{m.seq}</Link> : <span className="text-neutral-400">—</span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
      {w.role === "seller" && (
        <p className="text-[11px] text-neutral-500">
          자료 업로드·재업로드·JSON 가져오기는 대화의 &apos;파일&apos; 또는 <Link href={`/stores/${w.store.id}?tab=documents`} className="underline">내 매물 관리 &gt; 증빙자료</Link>에서 할 수 있습니다.
        </p>
      )}
    </div>
  );
}
