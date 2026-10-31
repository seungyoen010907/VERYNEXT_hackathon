import Link from "next/link";
import { VerificationBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, Notice, Panel, TestDataBadge } from "@/components/ui";
import { signedRate, won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { latestBundles } from "@/server/views";

export default async function RevenuePage() {
  const { db, viewer } = await requestContext();
  const rows = await latestBundles(db, viewer);
  return (
    <div className="space-y-4">
      <Notice>
        양도인 주장 매출을 POS·카드·배달앱 자료와 교차 검증한 결과입니다. 카드·배달 매출이 POS에 포함된 경우 중복 합산하지 않으며,
        자료 간 집계 기준이 다르면 &apos;검증 불가&apos;로 표시합니다. 매물을 누르면 월별 비교표와 근거 자료를 볼 수 있습니다.
      </Notice>
      <Panel title="매물별 매출 검증 결과" flush>
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th align="right">주장 월매출</Th>
              <Th align="right">증빙 월평균 매출</Th>
              <Th align="right">차이율</Th>
              <Th>판정</Th>
              <Th align="right">불일치</Th>
              <Th align="right">검증 불가</Th>
              <Th align="right">자료 부족</Th>
              <Th>판단 근거</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>매물이 없습니다.</EmptyRow>}
            {rows.map(({ store, bundle }) => {
              const checks = bundle?.revenueChecks ?? [];
              const claimed = checks.find((c) => c.checkType === "claimed_vs_evidence");
              const n = (s: string) => checks.filter((c) => c.status === s).length;
              return (
                <Tr key={store.id}>
                  <Td>
                    <Link href={`/stores/${store.id}?tab=revenue`} className="font-medium hover:underline">{store.name}</Link>
                    {store.isTestData && <span className="ml-1"><TestDataBadge /></span>}
                  </Td>
                  <Td align="right">{won(store.claimedMonthlyRevenue, "미입력")}</Td>
                  <Td align="right" strong>{bundle ? won(claimed?.expectedAmount, "확인 불가") : "—"}</Td>
                  <Td align="right" className={claimed?.status === "mismatch" ? "font-semibold text-red-700" : ""}>{signedRate(claimed?.differenceRate)}</Td>
                  <Td>{claimed ? <VerificationBadge status={claimed.status} /> : <Badge tone="muted">분석 전</Badge>}</Td>
                  <Td align="right" className={n("mismatch") ? "text-red-700" : ""}>{bundle ? n("mismatch") : "—"}</Td>
                  <Td align="right">{bundle ? n("unverifiable") : "—"}</Td>
                  <Td align="right">{bundle ? n("insufficient_data") : "—"}</Td>
                  <Td className="max-w-md text-[12px] text-neutral-600">{claimed?.basis ?? "—"}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
