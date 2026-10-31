import Link from "next/link";
import { notFound } from "next/navigation";
import { PremiumSection } from "@/components/analysis/premium-section";
import { ProfitSection } from "@/components/analysis/profit-section";
import { ReportView } from "@/components/analysis/report-view";
import { NoAnalysis, RevenueSection } from "@/components/analysis/revenue-section";
import { RiskSection } from "@/components/analysis/risk-section";
import { SaveDealReportButton } from "@/components/client/deal-actions";
import { Messenger, type ChatMessage, type PanelFinding, type PanelRun } from "@/components/client/messenger";
import { DocumentsSection, OverviewSection, TasksSection } from "@/components/deal/sections";
import { DEAL_TABS, WorkspaceHeader, type DealTab } from "@/components/deal/workspace-header";
import { Table, Td, Th, Tr } from "@/components/table";
import { ButtonLink, Notice, Panel, cx } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { dealWorkspace, type DealWorkspace } from "@/server/deals/views";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";
import { previewReport } from "@/server/repo/reports";
import { listDocuments } from "@/server/repo/documents";
import { storeDetail } from "@/server/views";
import type { Db } from "@/server/db/client";
import type { Viewer } from "@/server/viewer";

const ANALYSIS_SUBS = [
  { key: "revenue", label: "매출 검증" },
  { key: "profit", label: "수익성" },
  { key: "premium", label: "권리금 · 회수기간" },
  { key: "risk", label: "위험도" },
  { key: "report", label: "종합 보고서" },
] as const;
type AnalysisSub = (typeof ANALYSIS_SUBS)[number]["key"];

async function AnalysisSection({ db, viewer, w, sub }: { db: Db; viewer: Viewer; w: DealWorkspace; sub: AnalysisSub }) {
  const detail = await storeDetail(db, viewer, w.store.id);
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 rounded-sm border border-neutral-200 bg-white p-1" aria-label="분석 하위 탭">
        {ANALYSIS_SUBS.map((s) => (
          <Link
            key={s.key}
            href={`/deals/${w.deal.id}?tab=analysis&sub=${s.key}`}
            scroll={false}
            className={cx("rounded-sm px-3 py-1.5 text-[13px]", sub === s.key ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100")}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {detail.progress.analysisOutdated && <Notice tone="caution">최근 실사 분석 이후 새 자료가 있습니다. AI 거래 분석을 실행하면 최신 자료로 다시 계산합니다.</Notice>}
      {sub === "revenue" && <RevenueSection detail={detail} />}
      {sub === "profit" && <ProfitSection detail={detail} />}
      {sub === "premium" && <PremiumSection detail={detail} />}
      {sub === "risk" && <RiskSection detail={detail} />}
      {sub === "report" && (detail.bundle ? <ReportSub db={db} viewer={viewer} w={w} analysisId={detail.bundle.analysis.id} /> : <NoAnalysis />)}
    </div>
  );
}

async function ReportSub({ db, viewer, w, analysisId }: { db: Db; viewer: Viewer; w: DealWorkspace; analysisId: string }) {
  const { content, saved } = await previewReport(db, viewer, analysisId);
  return (
    <div className="space-y-4">
      <Panel
        title="거래 실사 보고서"
        description="매물 실사 결과에 거래 단계·조건 변경·체크리스트·AI 위험 항목을 더한 보고서입니다."
        actions={
          <>
            <SaveDealReportButton dealId={w.deal.id} />
            <ButtonLink href={`/deals/${w.deal.id}/report`} variant="primary">인쇄용 보기 · PDF</ButtonLink>
          </>
        }
      >
        {w.reports.length === 0 ? (
          <p className="text-[12px] text-neutral-500">저장된 거래 보고서가 없습니다. 저장하면 그 시점의 상태가 이력으로 남습니다.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>저장 시각</Th>
                <Th>저장한 사람</Th>
              </tr>
            </thead>
            <tbody>
              {w.reports.map((r) => (
                <Tr key={r.id}>
                  <Td>{dateTime(r.createdAt)}</Td>
                  <Td muted>{r.generatorName ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {w.role === "buyer" && w.runs.length > 0 && (
        <Panel title={`AI 분석 이력 (${w.runs.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>분석 시각</Th>
                <Th>계기</Th>
                <Th>메시지 범위</Th>
                <Th align="right">사용 자료</Th>
                <Th>요약</Th>
              </tr>
            </thead>
            <tbody>
              {w.runs.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{dateTime(r.createdAt)}</Td>
                  <Td muted className="whitespace-nowrap">{r.trigger === "messages" ? "대화 누적" : r.trigger === "documents" ? "새 증빙자료" : "대화 + 자료"}</Td>
                  <Td muted className="whitespace-nowrap">{r.fromSeq ? `#${r.fromSeq + 1}` : "처음"}~#{r.toSeq}</Td>
                  <Td align="right">{r.documentIds.length}건</Td>
                  <Td className="text-[12px]">{r.summary}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
      <Panel title="매물 종합 실사 보고서">
        <ReportView content={content} saved={!!saved} />
      </Panel>
    </div>
  );
}

export default async function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  const [{ id }, sp, { db, viewer }] = await Promise.all([params, searchParams, requestContext()]);
  const tabParam = typeof sp.tab === "string" ? sp.tab : "chat";
  const tab: DealTab = DEAL_TABS.some((t) => t.key === tabParam) ? (tabParam as DealTab) : "chat";
  const subParam = typeof sp.sub === "string" ? sp.sub : "revenue";
  const sub: AnalysisSub = ANALYSIS_SUBS.some((s) => s.key === subParam) ? (subParam as AnalysisSub) : "revenue";

  let w: DealWorkspace;
  try {
    w = await dealWorkspace(db, viewer, id, { markRead: tab === "chat" });
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const closed = ["completed", "cancelled"].includes(w.deal.stage);
  const storeDocs = tab === "documents" ? await listDocuments(db, [w.store.id]) : [];

  return (
    <div className="space-y-4">
      <WorkspaceHeader w={w} tab={tab} />
      {w.store.isTestData && <Notice>시연용 가상 매물과 대화입니다. 실제 점포·거래가 아닙니다.</Notice>}
      {tab === "overview" && <OverviewSection w={w} />}
      {tab === "chat" && (
        <Messenger
          dealId={w.deal.id}
          myId={viewer.id}
          role={w.role}
          counterpartName={w.counterpartName}
          closed={closed}
          stage={w.deal.stage}
          aiAutoRun={w.deal.aiAutoRun}
          initialMessages={w.messages as ChatMessage[]}
          eligibility={w.eligibility}
          latestRun={w.latestRun as unknown as PanelRun | null}
          findings={w.findings as PanelFinding[]}
          openTasks={w.tasks.filter((t) => t.status !== "done").map((t) => ({ id: t.id, key: t.key, title: t.title, status: t.status, requestTargetRole: t.requestTargetRole }))}
          aiMessages={w.aiMessages}
        />
      )}
      {tab === "tasks" && <TasksSection w={w} />}
      {tab === "documents" && <DocumentsSection w={w} storeDocs={storeDocs} />}
      {tab === "analysis" && <AnalysisSection db={db} viewer={viewer} w={w} sub={sub} />}
    </div>
  );
}
