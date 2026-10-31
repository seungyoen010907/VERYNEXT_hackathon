import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PremiumSection } from "@/components/analysis/premium-section";
import { ProfitSection } from "@/components/analysis/profit-section";
import { ReportView } from "@/components/analysis/report-view";
import { NoAnalysis, RevenueSection } from "@/components/analysis/revenue-section";
import { RiskSection } from "@/components/analysis/risk-section";
import { GenerateReportButton } from "@/components/client/actions";
import { ChatPanel } from "@/components/client/chat-panel";
import { RequestBuilder } from "@/components/client/request-builder";
import { DealStageBadge } from "@/components/deal/workspace-header";
import { ActivityTimeline } from "@/components/store/activity-tab";
import { DocumentsTab } from "@/components/store/documents-tab";
import { OverviewTab } from "@/components/store/overview-tab";
import { ANALYSIS_SUBTABS, StoreHeader, resolveStoreTab, type AnalysisSubTab } from "@/components/store/store-header";
import { ChecklistStateBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, ButtonLink, Notice, Panel, cx } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { chatProviderStatus } from "@/server/chat/answer";
import { listDeals } from "@/server/deals/repo";
import type { Db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";
import { listChat } from "@/server/repo/chat";
import { previewReport } from "@/server/repo/reports";
import { storeDetail, type StoreDetail } from "@/server/views";
import type { Viewer } from "@/server/viewer";

async function ReportTab({ db, viewer, detail }: { db: Db; viewer: Viewer; detail: StoreDetail }) {
  if (!detail.bundle) return <NoAnalysis />;
  const { content, saved } = await previewReport(db, viewer, detail.bundle.analysis.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-neutral-600">
          {saved ? "저장된 보고서입니다." : "아직 저장하지 않은 미리보기입니다. 보고서를 생성하면 분석 결과와 함께 보관됩니다."}
          {detail.progress.analysisOutdated && " 최근 분석 이후 새 자료가 있어 재분석 후 보고서를 다시 만드는 것을 권장합니다."}
        </p>
        <div className="flex items-start gap-2">
          {detail.canEdit && <GenerateReportButton analysisId={detail.bundle.analysis.id} regenerate={!!saved} />}
          {saved && <ButtonLink href={`/reports/${detail.bundle.analysis.id}`}>인쇄용 보기 · PDF</ButtonLink>}
        </div>
      </div>
      <Panel>
        <ReportView content={content} saved={!!saved} />
      </Panel>
    </div>
  );
}

async function ChatSub({ db, viewer, detail }: { db: Db; viewer: Viewer; detail: StoreDetail }) {
  if (!detail.bundle) return <NoAnalysis>AI 상담은 분석 결과를 근거로 답하므로 분석이 먼저 필요합니다.</NoAnalysis>;
  const history = await listChat(db, viewer, detail.bundle.analysis.id);
  return (
    <Panel title="AI 상담 (매물 실사 결과)" description="이 매물의 최신 실사 분석 결과를 근거로 답합니다. 거래 상대방과의 대화 분석은 각 거래 워크스페이스에서 합니다.">
      <ChatPanel analysisId={detail.bundle.analysis.id} initial={history} providerLabel={chatProviderStatus().label} />
    </Panel>
  );
}

function MissingSub({ detail }: { detail: StoreDetail }) {
  const c = detail.progress.checklist;
  return (
    <div className="space-y-4">
      <Panel title="누락 자료" flush description={`필수 ${c.requiredCount}건 중 ${c.submittedCount}건 제출`}>
        <Table>
          <thead>
            <tr>
              <Th>자료</Th>
              <Th>상태</Th>
              <Th>자료가 없으면 확인할 수 없는 분석</Th>
            </tr>
          </thead>
          <tbody>
            {c.items.filter((i) => i.state !== "complete").length === 0 && <EmptyRow colSpan={3}>누락 자료가 없습니다.</EmptyRow>}
            {c.items
              .filter((i) => i.state !== "complete")
              .map((i) => (
                <Tr key={i.key}>
                  <Td strong>{i.label}</Td>
                  <Td><ChecklistStateBadge state={i.state} required={i.required} /></Td>
                  <Td className="text-[12px]">{i.blockedAnalyses.join(", ")}</Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      </Panel>
      <Panel title="추가 확인 사항" description="실사 분석의 미확인 항목과 위험별 필요한 증빙입니다.">
        {detail.bundle ? (
          <ul className="list-disc space-y-1 pl-4 text-[13px]">
            {detail.bundle.analysis.missingData.map((m) => <li key={m}>{m} 미제출</li>)}
            {detail.bundle.risks.filter((r) => r.requiredDocuments.length > 0).map((r) => <li key={r.id}>{r.title}: {r.requiredDocuments.join(", ")}</li>)}
          </ul>
        ) : (
          <p className="text-[12px] text-neutral-500">분석 전입니다.</p>
        )}
      </Panel>
      <Panel title="추가 자료 요청 문구">
        <RequestBuilder storeId={detail.store.id} storeName={detail.store.name} items={c.missing.map(({ key, label, reason, requestText }) => ({ key, label, reason, requestText }))} />
      </Panel>
    </div>
  );
}

export default async function StorePage({ params, searchParams }: PageProps<"/stores/[id]">) {
  const [{ id }, sp, { db, viewer }] = await Promise.all([params, searchParams, requestContext()]);
  const { tab, sub } = resolveStoreTab(typeof sp.tab === "string" ? sp.tab : undefined, typeof sp.sub === "string" ? sp.sub : undefined);

  let detail: StoreDetail;
  try {
    detail = await storeDetail(db, viewer, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  // 매물 관리 화면은 소유자용이다. 다른 사용자는 공개 매물 상세로 보낸다.
  if (!detail.canEdit) redirect(`/listings/${id}`);
  const deals = await listDeals(db, viewer, "selling", id);

  return (
    <div className="space-y-4">
      <nav className="text-[12px] text-neutral-500">
        <Link href="/stores" className="hover:text-neutral-900">내 매물</Link> / <span className="text-neutral-800">{detail.store.name}</span>
      </nav>
      <StoreHeader detail={detail} tab={tab} dealCount={deals.length} />
      {detail.store.isTestData && <Notice>이 매물은 시연·테스트를 위해 만든 가상 데이터입니다. 실제 점포가 아닙니다.</Notice>}

      {tab === "overview" && (
        <>
          <OverviewTab detail={detail} />
          <details className="rounded-sm border border-neutral-200 bg-white">
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">매물 활동 기록 ({detail.activities.length})</summary>
            <div className="border-t border-neutral-200">
              <ActivityTimeline activities={detail.activities} />
            </div>
          </details>
        </>
      )}

      {tab === "deals" && (
        <Panel title={`거래 문의 (${deals.length})`} flush description="양수인별 거래 대화방입니다. 대화와 자료 요청은 각 거래 워크스페이스에서 합니다.">
          <Table>
            <thead>
              <tr>
                <Th>양수인</Th>
                <Th>최근 메시지</Th>
                <Th>최근 대화</Th>
                <Th align="right">읽지 않음</Th>
                <Th>거래 단계</Th>
                <Th align="right">미완료 업무</Th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 && <EmptyRow colSpan={6}>아직 거래 문의가 없습니다. 매물을 공개하면 양수인이 문의할 수 있습니다.</EmptyRow>}
              {deals.map((d) => (
                <Tr key={d.deal.id}>
                  <Td><Link href={`/deals/${d.deal.id}?tab=chat`} className="font-medium hover:underline">{d.counterpartName}</Link></Td>
                  <Td className="max-w-80 truncate text-[12px] text-neutral-700">{d.lastMessage?.body ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-[12px]">{dateTime(d.lastMessage?.createdAt)}</Td>
                  <Td align="right">{d.unread ? <Badge tone="critical">{d.unread}</Badge> : 0}</Td>
                  <Td><DealStageBadge stage={d.deal.stage} /></Td>
                  <Td align="right">{d.openTasks}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {tab === "analysis" && (
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-1 rounded-sm border border-neutral-200 bg-white p-1" aria-label="실사 분석 하위 탭">
            {ANALYSIS_SUBTABS.map((s) => (
              <Link
                key={s.key}
                href={`/stores/${id}?tab=analysis&sub=${s.key}`}
                scroll={false}
                className={cx("rounded-sm px-3 py-1.5 text-[13px]", sub === s.key ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100")}
              >
                {s.label}
              </Link>
            ))}
          </nav>
          {sub === "revenue" && <RevenueSection detail={detail} />}
          {sub === "profit" && <ProfitSection detail={detail} />}
          {sub === "premium" && <PremiumSection detail={detail} />}
          {sub === "risk" && <RiskSection detail={detail} />}
          {sub === "missing" && <MissingSub detail={detail} />}
          {sub === ("chat" as AnalysisSubTab) && <ChatSub db={db} viewer={viewer} detail={detail} />}
        </div>
      )}

      {tab === "documents" && <DocumentsTab detail={detail} typeFilter={typeof sp.type === "string" ? sp.type : undefined} />}
      {tab === "report" && <ReportTab db={db} viewer={viewer} detail={detail} />}
    </div>
  );
}
