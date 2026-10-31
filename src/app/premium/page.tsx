import Link from "next/link";
import { PaybackBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, Notice, Panel, TestDataBadge } from "@/components/ui";
import { won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { analysisHref, latestBundles } from "@/server/views";
import { DiligenceSubnav } from "@/components/diligence-subnav";

export default async function PremiumPage() {
  const { db, viewer } = await requestContext();
  const rows = await latestBundles(db, viewer);
  return (
    <div className="space-y-4">
      <DiligenceSubnav active="/premium" />
      <Notice>
        초기 투자금 = 보증금 + 권리금 + 시설 투자금 + 기타 인수 비용, 단순 회수 기간 = 초기 투자금 ÷ 월평균 영업이익. 시장 거래 데이터가 없으므로 적정 권리금은 판단하지 않습니다.
      </Notice>
      <Panel title="매물별 권리금 · 투자금 회수" flush>
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th align="right">보증금</Th>
              <Th align="right">권리금</Th>
              <Th align="right">시설·기타</Th>
              <Th align="right">총 초기 투자금</Th>
              <Th align="right">월평균 현금흐름</Th>
              <Th align="right">권리금 ÷ 월 영업이익</Th>
              <Th align="right">회수 기간</Th>
              <Th>상태</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>매물이 없습니다.</EmptyRow>}
            {rows.map(({ store, bundle, canEdit, dealId }) => {
              const p = bundle?.premium;
              const missing = store.facilityInvestment === null || store.otherInitialCost === null;
              return (
                <Tr key={store.id}>
                  <Td>
                    <Link href={analysisHref({ store, canEdit, dealId }, "premium")} className="font-medium hover:underline">{store.name}</Link>
                    {store.isTestData && <span className="ml-1"><TestDataBadge /></span>}
                  </Td>
                  <Td align="right">{won(store.deposit)}</Td>
                  <Td align="right" strong>{won(store.premium)}</Td>
                  <Td align="right">
                    {missing ? <span className="text-neutral-400">일부 미입력</span> : won((store.facilityInvestment ?? 0) + (store.otherInitialCost ?? 0))}
                  </Td>
                  <Td align="right">{p ? won(p.totalInitialInvestment) : "—"}{p && missing && <span className="block text-[11px] text-neutral-500">최소값</span>}</Td>
                  <Td align="right" className={(p?.monthlyCashFlow ?? 0) < 0 ? "text-red-700" : ""}>{p ? won(p.monthlyCashFlow, "계산 불가") : "—"}</Td>
                  <Td align="right">{p?.monthlyCashFlow && p.monthlyCashFlow > 0 ? `${(p.premium / p.monthlyCashFlow).toFixed(1)}개월` : "—"}</Td>
                  <Td align="right" strong>{p?.paybackMonths != null ? `${p.paybackMonths}개월` : "—"}</Td>
                  <Td>{p ? <PaybackBadge status={p.paybackStatus} /> : <Badge tone="muted">분석 전</Badge>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
