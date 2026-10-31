import Link from "next/link";
import { notFound } from "next/navigation";
import { PremiumSection } from "@/components/analysis/premium-section";
import { ProfitSection } from "@/components/analysis/profit-section";
import { ReportView } from "@/components/analysis/report-view";
import { NoAnalysis, RevenueSection } from "@/components/analysis/revenue-section";
import { RiskSection } from "@/components/analysis/risk-section";
import { GenerateReportButton } from "@/components/client/actions";
import { ChatPanel } from "@/components/client/chat-panel";
import { ActivityTab } from "@/components/store/activity-tab";
import { DocumentsTab } from "@/components/store/documents-tab";
import { OverviewTab } from "@/components/store/overview-tab";
import { STORE_TABS, StoreHeader, type StoreTab } from "@/components/store/store-header";
import { ButtonLink, Notice, Panel } from "@/components/ui";
import { chatProviderStatus } from "@/server/chat/answer";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";
import { listChat } from "@/server/repo/chat";
import { previewReport } from "@/server/repo/reports";
import { storeDetail, type StoreDetail } from "@/server/views";

async function ReportTab({ detail }: { detail: StoreDetail }) {
  if (!detail.bundle) return <NoAnalysis />;
  const { db, viewer } = await requestContext();
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

async function ChatTab({ detail }: { detail: StoreDetail }) {
  if (!detail.bundle) return <NoAnalysis>AI 상담은 분석 결과를 근거로 답하므로 분석이 먼저 필요합니다.</NoAnalysis>;
  const { db, viewer } = await requestContext();
  const history = await listChat(db, viewer, detail.bundle.analysis.id);
  return (
    <Panel title="AI 상담" description="이 매물의 최신 분석 결과(매출 검증·수익성·권리금·위험도)를 기반으로 답변합니다.">
      <ChatPanel analysisId={detail.bundle.analysis.id} initial={history} providerLabel={chatProviderStatus().label} />
    </Panel>
  );
}

export default async function StorePage({ params, searchParams }: PageProps<"/stores/[id]">) {
  const [{ id }, sp, { db, viewer }] = await Promise.all([params, searchParams, requestContext()]);
  const tabParam = typeof sp.tab === "string" ? sp.tab : "overview";
  const tab: StoreTab = STORE_TABS.some((t) => t.key === tabParam) ? (tabParam as StoreTab) : "overview";

  let detail: StoreDetail;
  try {
    detail = await storeDetail(db, viewer, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-4">
      <nav className="text-[12px] text-neutral-500">
        <Link href="/stores" className="hover:text-neutral-900">매물 관리</Link> / <span className="text-neutral-800">{detail.store.name}</span>
      </nav>
      <StoreHeader detail={detail} tab={tab} />
      {detail.store.isTestData && (
        <Notice>이 매물은 시연·테스트를 위해 만든 가상 데이터입니다. 실제 점포가 아닙니다.</Notice>
      )}
      {tab === "overview" && <OverviewTab detail={detail} />}
      {tab === "documents" && <DocumentsTab detail={detail} typeFilter={typeof sp.type === "string" ? sp.type : undefined} />}
      {tab === "revenue" && <RevenueSection detail={detail} />}
      {tab === "profit" && <ProfitSection detail={detail} />}
      {tab === "premium" && <PremiumSection detail={detail} />}
      {tab === "risk" && <RiskSection detail={detail} />}
      {tab === "report" && <ReportTab detail={detail} />}
      {tab === "activity" && <ActivityTab activities={detail.activities} />}
      {tab === "chat" && <ChatTab detail={detail} />}
    </div>
  );
}
