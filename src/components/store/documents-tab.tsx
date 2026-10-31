import Link from "next/link";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/types/domain";
import { date, dateTime, fileSize } from "@/lib/format";
import type { DocumentRow } from "@/server/repo/documents";
import type { StoreDetail } from "@/server/views";
import { AnalyzeDocumentButton } from "../client/actions";
import { ImportJsonPanel, UploadPanel } from "../client/documents";
import { RequestBuilder } from "../client/request-builder";
import { ChecklistStateBadge, DocumentStatusBadge } from "../status";
import { EmptyRow, Table, Td, Th, Tr } from "../table";
import { Badge, Notice, Panel } from "../ui";

export function DocumentFlags({ doc }: { doc: DocumentRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {doc.replacedById && <Badge tone="muted">재업로드로 대체됨</Badge>}
      {doc.replacesDocumentId && <Badge tone="info">재업로드본</Badge>}
      {doc.duplicateOfIds.length > 0 && <Badge tone="caution">중복 가능성</Badge>}
      {doc.warningCount > 0 && <Badge tone="caution">검토 필요 · 경고 {doc.warningCount}</Badge>}
      {doc.analysisProvider === "sample-fixture" && <Badge tone="info">샘플 분석</Badge>}
    </span>
  );
}

export function DocumentsTab({ detail, typeFilter }: { detail: StoreDetail; typeFilter?: string }) {
  const { store, canEdit, progress, documents, requests } = detail;
  const checklist = progress.checklist;
  const docsById = new Map(documents.map((d) => [d.id, d]));
  const shown = typeFilter ? documents.filter((d) => d.documentType === typeFilter) : documents;
  const activeDocs = documents.filter((d) => !d.replacedById);

  return (
    <div className="space-y-4">
      <Panel
        title="누락 자료 체크리스트"
        description={`업종(${store.industry}) 기준 필수 ${checklist.requiredCount}건 중 ${checklist.submittedCount}건 제출 · ${checklist.completeCount}건 분석 완료`}
        flush
      >
        <Table>
          <thead>
            <tr>
              <Th>자료</Th>
              <Th>구분</Th>
              <Th>상태</Th>
              <Th>필요한 이유</Th>
              <Th>자료가 없으면 확인할 수 없는 분석</Th>
              <Th>제출 문서</Th>
            </tr>
          </thead>
          <tbody>
            {checklist.items.map((i) => (
              <Tr key={i.key}>
                <Td strong className="whitespace-nowrap">{i.label}</Td>
                <Td muted>{i.required ? "필수" : "선택"}</Td>
                <Td>
                  <ChecklistStateBadge state={i.state} required={i.required} />
                  {i.note && <span className="mt-0.5 block text-[11px] text-neutral-500">{i.note}</span>}
                </Td>
                <Td className="text-[12px] text-neutral-700">{i.reason}</Td>
                <Td className="text-[12px] text-neutral-700">
                  {i.state === "complete" ? <span className="text-neutral-400">—</span> : i.blockedAnalyses.join(", ")}
                </Td>
                <Td className="text-[12px]">
                  {i.documentIds.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : canEdit ? (
                    i.documentIds.map((id) => (
                      <a key={id} href={`#doc-${id}`} className="block truncate text-blue-800 underline underline-offset-2">
                        {docsById.get(id)?.fileName ?? id.slice(0, 8)}
                      </a>
                    ))
                  ) : (
                    `${i.documentIds.length}건`
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel title="추가 자료 요청" description="미제출 자료를 골라 양도인에게 보낼 요청 문구를 만듭니다. 요청 기록은 활동 기록에 남습니다.">
        <RequestBuilder
          storeId={store.id}
          storeName={store.name}
          items={checklist.missing.map(({ key, label, reason, requestText }) => ({ key, label, reason, requestText }))}
        />
        {requests.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-[12px] font-medium text-neutral-700">요청 이력</p>
            <Table>
              <thead>
                <tr>
                  <Th>요청일</Th>
                  <Th>요청자</Th>
                  <Th>요청 자료</Th>
                  <Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap">{dateTime(r.createdAt)}</Td>
                    <Td>{r.requesterName ?? "—"}</Td>
                    <Td className="text-[12px]">{r.checklistKeys.map((k) => checklist.items.find((i) => i.key === k)?.label ?? k).join(", ")}</Td>
                    <Td>
                      {r.status === "open" ? <Badge tone="caution">대기</Badge> : r.status === "fulfilled" ? <Badge tone="positive">제출 완료 {date(r.fulfilledAt)}</Badge> : <Badge tone="muted">취소</Badge>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Panel>

      {!canEdit ? (
        <Notice>원본 증빙 문서는 매물 소유자(양도인)만 열람할 수 있습니다. 양수인은 체크리스트로 제출 여부와 분석 결과를 확인할 수 있습니다.</Notice>
      ) : (
        <>
          <UploadPanel
            storeId={store.id}
            providerLabel={detail.providerStatus.label}
            replaceOptions={activeDocs.map((d) => ({ id: d.id, documentType: d.documentType, label: `${d.fileName} (${date(d.createdAt)})` }))}
          />

          <Panel
            title={`자료 목록 (${shown.length})`}
            flush
            actions={
              <form className="flex items-center gap-2">
                <input type="hidden" name="tab" value="documents" />
                <select name="type" defaultValue={typeFilter ?? ""} className="h-7 rounded-sm border border-neutral-300 bg-white px-2 text-[12px]">
                  <option value="">전체 종류</option>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <button type="submit" className="h-7 rounded-sm border border-neutral-300 px-2 text-[12px] hover:bg-neutral-50">적용</button>
              </form>
            }
          >
            <Table>
              <thead>
                <tr>
                  <Th>파일</Th>
                  <Th>종류</Th>
                  <Th>자료 기간</Th>
                  <Th>업로드</Th>
                  <Th>제출자</Th>
                  <Th>분석 상태</Th>
                  <Th>이력 · 검토</Th>
                  <Th align="right">작업</Th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <EmptyRow colSpan={8}>업로드된 자료가 없습니다.</EmptyRow>}
                {shown.map((d) => (
                  <Tr key={d.id} className={d.replacedById ? "text-neutral-400" : ""}>
                    <Td>
                      <span id={`doc-${d.id}`} className="block max-w-64 truncate font-medium text-neutral-900">{d.fileName}</span>
                      <span className="text-[11px] text-neutral-500">{fileSize(d.fileSize)}</span>
                      {d.errorMessage && <span className="block max-w-64 text-[11px] text-red-700">{d.errorMessage}</span>}
                    </Td>
                    <Td className="whitespace-nowrap">{DOCUMENT_TYPE_LABELS[d.documentType]}</Td>
                    <Td className="whitespace-nowrap text-[12px]">{d.periodStart ? `${date(d.periodStart)} ~ ${date(d.periodEnd)}` : "—"}</Td>
                    <Td className="whitespace-nowrap text-[12px]">{dateTime(d.createdAt)}</Td>
                    <Td className="text-[12px]">{d.uploaderName ?? "—"}</Td>
                    <Td><DocumentStatusBadge status={d.status} /></Td>
                    <Td><DocumentFlags doc={d} /></Td>
                    <Td align="right">
                      <span className="inline-flex items-start gap-1.5">
                        <a href={`/api/documents/${d.id}?download=1`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-sm border border-neutral-300 px-2 text-[12px] hover:bg-neutral-50">
                          열기
                        </a>
                        {!d.replacedById && d.status !== "analyzed" && <AnalyzeDocumentButton documentId={d.id} label={d.status === "failed" ? "재분석" : "분석"} />}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <ImportJsonPanel
            storeId={store.id}
            documents={activeDocs.filter((d) => d.status !== "analyzed").map((d) => ({ id: d.id, label: `${d.fileName} · ${DOCUMENT_TYPE_LABELS[d.documentType]}` }))}
          />
          <p className="text-[11px] text-neutral-500">
            문서 분석 모듈 연동 규격은 <Link href="/dev/schema" className="underline">개발 현황</Link>과 docs/ai-integration.md를 참고하세요.
          </p>
        </>
      )}
    </div>
  );
}
