import Link from "next/link";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from "@/types/domain";
import { FilterBar, FilterSelect, param } from "@/components/filter-bar";
import { DocumentStatusBadge } from "@/components/status";
import { DocumentFlags } from "@/components/store/documents-tab";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Kpi, KpiRow, Notice } from "@/components/ui";
import { date, dateTime, fileSize } from "@/lib/format";
import { requestContext } from "@/server/http";
import { listDeals } from "@/server/deals/repo";
import { listTasks } from "@/server/deals/tasks";
import type { Db } from "@/server/db/client";
import type { Viewer } from "@/server/viewer";
import { listDocuments } from "@/server/repo/documents";
import { listStores } from "@/server/repo/stores";
import { canEdit } from "@/server/viewer";

/** 양수인: 거래별로 요청한 자료의 제출·검토 상태 (원본은 대화에서 공유된 것만 열람) */
async function BuyerDocuments({ db, viewer }: { db: Db; viewer: Viewer }) {
  const deals = await listDeals(db, viewer, "buying");
  const tasks = await Promise.all(deals.map((d) => listTasks(db, d.deal.id)));
  const shared = await db.query<{ deal_id: string; n: number }>(
    `select m.deal_id, count(*)::int as n from deal_messages m join deals d on d.id = m.deal_id
      where d.buyer_id = $1 and m.document_id is not null group by m.deal_id`,
    [viewer.id],
  );
  const sharedBy = new Map(shared.map((r) => [r.deal_id, r.n]));
  return (
    <div className="space-y-4">
      <Notice>양수인은 거래 대화에서 양도인이 공유한 자료만 열람할 수 있습니다. 거래별 요청 자료 상태입니다.</Notice>
      <div className="rounded-sm border border-neutral-200 bg-white">
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th align="right">공유받은 파일</Th>
              <Th align="right">요청 완료</Th>
              <Th align="right">제출·검토 중</Th>
              <Th align="right">추가 자료 필요</Th>
              <Th align="right">완료</Th>
              <Th align="right">미요청</Th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && <EmptyRow colSpan={7}>문의한 거래가 없습니다.</EmptyRow>}
            {deals.map((d, i) => {
              const docTasks = tasks[i].filter((t) => t.requestTargetRole === "seller");
              const n = (...st: string[]) => docTasks.filter((t) => st.includes(t.status)).length;
              return (
                <Tr key={d.deal.id}>
                  <Td><Link href={`/deals/${d.deal.id}?tab=documents`} className="font-medium hover:underline">{d.store.name}</Link></Td>
                  <Td align="right">{sharedBy.get(d.deal.id) ?? 0}</Td>
                  <Td align="right">{n("requested")}</Td>
                  <Td align="right">{n("submitted", "reviewing")}</Td>
                  <Td align="right" className={n("needs_more") ? "text-amber-800" : ""}>{n("needs_more")}</Td>
                  <Td align="right">{n("done")}</Td>
                  <Td align="right" muted>{n("not_requested")}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const owned = (await listStores(db, viewer)).filter((s) => canEdit(viewer, s));
  if (owned.length === 0) {
    return <BuyerDocuments db={db} viewer={viewer} />;
  }
  const filters = {
    storeId: param(sp, "store"),
    documentType: param(sp, "type") as DocumentType | undefined,
    status: param(sp, "status") as DocumentStatus | undefined,
  };
  const all = await listDocuments(db, owned.map((s) => s.id));
  const docs = all.filter(
    (d) =>
      (!filters.storeId || d.storeId === filters.storeId) &&
      (!filters.documentType || d.documentType === filters.documentType) &&
      (!filters.status || d.status === filters.status),
  );
  const active = all.filter((d) => !d.replacedById);

  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="전체 자료" value={all.length} sub={`재업로드로 대체된 자료 ${all.length - active.length}건 포함`} />
        <Kpi label="분석 완료" value={active.filter((d) => d.status === "analyzed").length} />
        <Kpi label="분석 대기 · 실패" value={active.filter((d) => d.status === "uploaded" || d.status === "analyzing" || d.status === "failed").length} emphasis={active.some((d) => d.status === "failed")} />
        <Kpi label="검토 필요 (경고 · 중복)" value={active.filter((d) => d.warningCount > 0 || d.duplicateOfIds.length > 0).length} />
      </KpiRow>

      <FilterBar action="/documents" resetHref="/documents" total={docs.length}>
        <FilterSelect name="store" label="매물" value={filters.storeId} options={owned.map((s) => ({ value: s.id, label: s.name }))} />
        <FilterSelect name="type" label="문서 종류" value={filters.documentType} options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))} />
        <FilterSelect name="status" label="분석 상태" value={filters.status} options={DOCUMENT_STATUSES.map((s) => ({ value: s, label: DOCUMENT_STATUS_LABELS[s] }))} />
      </FilterBar>

      <div className="rounded-sm border border-neutral-200 bg-white">
        <Table>
          <thead>
            <tr>
              <Th>파일</Th>
              <Th>매물</Th>
              <Th>종류</Th>
              <Th>자료 기간</Th>
              <Th>업로드</Th>
              <Th>제출자</Th>
              <Th>분석 상태</Th>
              <Th>이력 · 검토</Th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && <EmptyRow colSpan={8}>조건에 맞는 자료가 없습니다.</EmptyRow>}
            {docs.map((d) => (
              <Tr key={d.id} className={d.replacedById ? "text-neutral-400" : ""}>
                <Td>
                  <a href={`/api/documents/${d.id}?download=1`} target="_blank" rel="noreferrer" className="block max-w-72 truncate font-medium text-neutral-900 hover:underline">{d.fileName}</a>
                  <span className="text-[11px] text-neutral-500">{fileSize(d.fileSize)}</span>
                </Td>
                <Td className="text-[12px]"><Link href={`/stores/${d.storeId}?tab=documents`} className="hover:underline">{d.storeName}</Link></Td>
                <Td className="whitespace-nowrap">{DOCUMENT_TYPE_LABELS[d.documentType]}</Td>
                <Td className="whitespace-nowrap text-[12px]">{d.periodStart ? `${date(d.periodStart)} ~ ${date(d.periodEnd)}` : "—"}</Td>
                <Td className="whitespace-nowrap text-[12px]">{dateTime(d.createdAt)}</Td>
                <Td className="text-[12px]">{d.uploaderName ?? "—"}</Td>
                <Td><DocumentStatusBadge status={d.status} /></Td>
                <Td><DocumentFlags doc={d} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="text-[11px] text-neutral-500">업로드·재업로드·분석은 각 매물의 &apos;증빙 자료&apos; 탭에서 합니다. 같은 기능을 이 화면에 중복으로 두지 않았습니다.</p>
    </div>
  );
}
