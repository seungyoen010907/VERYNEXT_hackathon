import Link from "next/link";
import { EXPENSE_CATEGORY_LABELS } from "@/types/domain";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, Notice, Panel, TestDataBadge } from "@/components/ui";
import { pct, won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { analysisHref, latestBundles } from "@/server/views";
import { DiligenceSubnav } from "@/components/diligence-subnav";

export default async function ProfitPage() {
  const { db, viewer } = await requestContext();
  const rows = await latestBundles(db, viewer);
  return (
    <div className="space-y-4">
      <DiligenceSubnav active="/profit" />
      <Notice>영업이익 = 총매출 − 총영업비용. 확인되지 않은 비용은 0원으로 계산하지 않습니다. 필수 비용이 빠지면 영업이익을 계산하지 않고, 선택 비용이 빠지면 상한값으로 표시합니다.</Notice>
      <Panel title="매물별 수익성 (월평균)" flush>
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th align="right">총매출</Th>
              <Th align="right">총영업비용</Th>
              <Th align="right">추정 영업이익</Th>
              <Th align="right">영업이익률</Th>
              <Th align="right">주장 순수익</Th>
              <Th>계산 상태</Th>
              <Th>미확인 비용</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8}>매물이 없습니다.</EmptyRow>}
            {rows.map(({ store, bundle, canEdit, dealId }) => {
              const avg = bundle?.profits.find((p) => p.periodType === "average");
              return (
                <Tr key={store.id}>
                  <Td>
                    <Link href={analysisHref({ store, canEdit, dealId }, "profit")} className="font-medium hover:underline">{store.name}</Link>
                    {store.isTestData && <span className="ml-1"><TestDataBadge /></span>}
                  </Td>
                  <Td align="right">{won(avg?.totalRevenue)}</Td>
                  <Td align="right">{avg ? won(avg.totalOperatingCost, "계산 불가") : "—"}</Td>
                  <Td align="right" strong className={(avg?.operatingProfit ?? 0) < 0 ? "text-red-700" : ""}>{avg ? won(avg.operatingProfit, "계산 불가") : "—"}</Td>
                  <Td align="right">{pct(avg?.operatingMargin)}</Td>
                  <Td align="right">{won(store.claimedMonthlyNetProfit, "미입력")}</Td>
                  <Td>
                    {!bundle ? <Badge tone="muted">분석 전</Badge> : !avg ? <Badge tone="muted">매출 증빙 없음</Badge> : avg.operatingProfit === null ? <Badge tone="negative">필수 비용 누락</Badge> : avg.isComplete ? <Badge tone="positive">전체 비용 확인</Badge> : <Badge tone="caution">상한값</Badge>}
                  </Td>
                  <Td className="text-[12px]">{avg?.missingCostCategories.length ? avg.missingCostCategories.map((c) => EXPENSE_CATEGORY_LABELS[c]).join(", ") : <span className="text-neutral-400">—</span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
