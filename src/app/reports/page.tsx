import Link from "next/link";
import { GenerateReportButton } from "@/components/client/actions";
import { RiskBadge, VerificationLevelBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, Notice, Panel, TestDataBadge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requestContext } from "@/server/http";
import { storeOverviews } from "@/server/views";

export default async function ReportsPage() {
  const { db, viewer } = await requestContext();
  const rows = await storeOverviews(db, viewer, {}, { managed: true });
  return (
    <div className="space-y-4">
      <Notice>보고서는 매물별 최신 완료 분석을 기준으로 만듭니다. 생성한 보고서는 분석 이력과 함께 보관되며 인쇄용 화면에서 PDF로 저장할 수 있습니다.</Notice>
      <Panel title="실사 보고서" flush>
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th>최신 분석</Th>
              <Th>검증 수준</Th>
              <Th>최고 위험</Th>
              <Th>보고서</Th>
              <Th align="right">작업</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>매물이 없습니다.</EmptyRow>}
            {rows.map(({ store, summary, progress, canEdit, dealId }) => (
              <Tr key={store.id}>
                <Td>
                  <Link href={canEdit ? `/stores/${store.id}?tab=report` : `/deals/${dealId}?tab=analysis&sub=report`} className="font-medium hover:underline">{store.name}</Link>
                  {store.isTestData && <span className="ml-1"><TestDataBadge /></span>}
                </Td>
                <Td className="whitespace-nowrap text-[12px]">{summary ? dateTime(summary.completedAt) : "—"}</Td>
                <Td><VerificationLevelBadge level={summary?.verificationLevel ?? null} /></Td>
                <Td>{summary ? <RiskBadge level={summary.overallRisk} /> : "—"}</Td>
                <Td>
                  {!summary ? <Badge tone="muted">분석 필요</Badge> : summary.hasReport ? <Badge tone="positive">생성됨</Badge> : <Badge tone="neutral">미생성</Badge>}
                  {summary?.hasReport && progress.analysisOutdated && <Badge tone="caution" className="ml-1">새 자료 있음</Badge>}
                </Td>
                <Td align="right">
                  <span className="inline-flex gap-2">
                    {summary?.hasReport && canEdit && (
                      <Link href={`/reports/${summary.analysisId}`} className="inline-flex h-8 items-center rounded-sm border border-neutral-300 px-3 text-[13px] hover:bg-neutral-50">
                        인쇄용 보기
                      </Link>
                    )}
                    {summary && canEdit && <GenerateReportButton analysisId={summary.analysisId} regenerate={summary.hasReport} />}
                    {!canEdit && dealId && (
                      <Link href={`/deals/${dealId}/report`} className="inline-flex h-8 items-center rounded-sm border border-neutral-300 px-3 text-[13px] hover:bg-neutral-50">
                        거래 보고서
                      </Link>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
