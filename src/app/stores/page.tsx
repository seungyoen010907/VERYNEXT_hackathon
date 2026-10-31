import Link from "next/link";
import { STORE_STATUSES, STORE_STATUS_LABELS, type StoreStatus } from "@/types/domain";
import { FilterBar, FilterSearch, FilterSelect, param } from "@/components/filter-bar";
import { RiskBadge, StoreStatusBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, ButtonLink, Progress, TestDataBadge } from "@/components/ui";
import { months, won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { listFilterOptions } from "@/server/repo/stores";
import { storeOverviews } from "@/server/views";

export default async function StoresPage({ searchParams }: PageProps<"/stores">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const filters = {
    q: param(sp, "q"),
    industry: param(sp, "industry"),
    region: param(sp, "region"),
    status: param(sp, "status") as StoreStatus | undefined,
  };
  const [all, options] = await Promise.all([storeOverviews(db, viewer, filters), listFilterOptions(db, viewer)]);
  // 내 매물만 보여준다. 다른 양도인의 공개 매물은 매물 둘러보기에서 본다.
  const rows = all.filter((o) => o.canEdit);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-neutral-600">
          내가 등록한 매물입니다. 다른 매물은 <Link href="/listings" className="underline">매물 둘러보기</Link>에서 찾을 수 있습니다.
        </p>
        {viewer.role !== "buyer" && <ButtonLink href="/stores/new" variant="primary">매물 등록</ButtonLink>}
      </div>
      <FilterBar action="/stores" resetHref="/stores" total={rows.length}>
        <FilterSearch value={filters.q} placeholder="점포명·주소·업종" />
        <FilterSelect name="industry" label="업종" value={filters.industry} options={options.industries.map((v) => ({ value: v, label: v }))} />
        <FilterSelect name="region" label="지역" value={filters.region} options={options.regions.map((v) => ({ value: v, label: v }))} />
        <FilterSelect name="status" label="상태" value={filters.status} options={STORE_STATUSES.map((s) => ({ value: s, label: STORE_STATUS_LABELS[s] }))} />
      </FilterBar>

      <div className="rounded-sm border border-neutral-200 bg-white">
        <Table>
          <thead>
            <tr>
              <Th>점포명</Th>
              <Th>업종</Th>
              <Th>지역</Th>
              <Th align="right">영업 기간</Th>
              <Th align="right">보증금</Th>
              <Th align="right">월세</Th>
              <Th align="right">권리금</Th>
              <Th align="right">주장 월매출</Th>
              <Th align="right">주장 월순수익</Th>
              <Th>상태</Th>
              <Th width="120px">실사 진행</Th>
              <Th>최고 위험</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={12}>{viewer.role === "buyer" ? "등록한 매물이 없습니다. 매물 등록은 양도인 계정으로 할 수 있습니다." : "조건에 맞는 매물이 없습니다."}</EmptyRow>}
            {rows.map(({ store, summary, progress }) => (
              <Tr key={store.id}>
                <Td>
                  <Link href={`/stores/${store.id}`} className="font-medium text-neutral-900 hover:underline">{store.name}</Link>
                  <span className="mt-0.5 flex gap-1">
                    {store.isTestData && <TestDataBadge />}
                    {!store.isPublished && <Badge tone="muted">비공개</Badge>}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{store.industry}</Td>
                <Td className="whitespace-nowrap">{store.region}</Td>
                <Td align="right" className="whitespace-nowrap">{months(store.businessPeriodMonths)}</Td>
                <Td align="right">{won(store.deposit)}</Td>
                <Td align="right">{won(store.monthlyRent)}</Td>
                <Td align="right" strong>{won(store.premium)}</Td>
                <Td align="right">{won(store.claimedMonthlyRevenue, "미입력")}</Td>
                <Td align="right">{won(store.claimedMonthlyNetProfit, "미입력")}</Td>
                <Td><StoreStatusBadge status={store.status} /></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Progress value={progress.percent} />
                    <span className="w-8 text-right text-[12px] tabular-nums">{progress.percent}%</span>
                  </div>
                </Td>
                <Td>{summary ? <RiskBadge level={summary.overallRisk} /> : <Badge tone="muted">분석 전</Badge>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      {filters.status && <Link href="/stores" className="text-[12px] underline">상태 필터 해제</Link>}
    </div>
  );
}
