import Link from "next/link";
import { LISTING_STATUS_LABELS, LISTING_STATUSES, type ListingStatus } from "@/types/domain";
import { FilterBar, FilterSearch, FilterSelect, param } from "@/components/filter-bar";
import { ListingThumb } from "@/components/listing-thumb";
import { ListingStatusBadge, VerificationLevelBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, ButtonLink, TestDataBadge } from "@/components/ui";
import { date, won } from "@/lib/format";
import { requestContext } from "@/server/http";
import { latestAnalysisSummaries } from "@/server/repo/analyses";
import { listingFilterOptions, listListings } from "@/server/repo/stores";

const MAN = 10_000;
const PRICE_OPTIONS = {
  premiumMax: [3000, 5000, 8000, 10000],
  depositMax: [2000, 3000, 5000],
  rentMax: [150, 200, 300, 500],
  revenueMin: [1500, 2000, 3000, 4000],
};
const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) * MAN : undefined);

export default async function ListingsPage({ searchParams }: PageProps<"/listings">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const f = {
    q: param(sp, "q"),
    industry: param(sp, "industry"),
    region: param(sp, "region"),
    status: param(sp, "status") as ListingStatus | undefined,
    premiumMax: param(sp, "premiumMax"),
    depositMax: param(sp, "depositMax"),
    rentMax: param(sp, "rentMax"),
    revenueMin: param(sp, "revenueMin"),
  };
  const [rows, options] = await Promise.all([
    listListings(db, {
      q: f.q,
      industry: f.industry,
      region: f.region,
      status: f.status && LISTING_STATUSES.includes(f.status) ? f.status : undefined,
      premiumMax: num(f.premiumMax),
      depositMax: num(f.depositMax),
      rentMax: num(f.rentMax),
      revenueMin: num(f.revenueMin),
    }),
    listingFilterOptions(db),
  ]);
  const summaries = await latestAnalysisSummaries(db, rows.map((r) => r.id));
  const manOpts = (vals: number[], suffix: string) => vals.map((v) => ({ value: String(v), label: `${v.toLocaleString("ko-KR")}만 원 ${suffix}` }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-neutral-600">양도인이 공개한 매물입니다. 매출·수익은 양도인이 공개를 허용한 경우에만 표시합니다.</p>
        {viewer.role !== "buyer" && <ButtonLink href="/stores/new" variant="primary">매물 등록</ButtonLink>}
      </div>
      <FilterBar action="/listings" resetHref="/listings" total={rows.length}>
        <FilterSearch value={f.q} placeholder="매물명·주소·업종" />
        <FilterSelect name="region" label="지역" value={f.region} options={options.regions.map((v) => ({ value: v, label: v }))} />
        <FilterSelect name="industry" label="업종" value={f.industry} options={options.industries.map((v) => ({ value: v, label: v }))} />
        <FilterSelect name="premiumMax" label="권리금" value={f.premiumMax} options={manOpts(PRICE_OPTIONS.premiumMax, "이하")} />
        <FilterSelect name="depositMax" label="보증금" value={f.depositMax} options={manOpts(PRICE_OPTIONS.depositMax, "이하")} />
        <FilterSelect name="rentMax" label="월세" value={f.rentMax} options={manOpts(PRICE_OPTIONS.rentMax, "이하")} />
        <FilterSelect name="revenueMin" label="월매출(공개)" value={f.revenueMin} options={manOpts(PRICE_OPTIONS.revenueMin, "이상")} />
        <FilterSelect name="status" label="매물 상태" value={f.status} options={LISTING_STATUSES.map((s) => ({ value: s, label: LISTING_STATUS_LABELS[s] }))} />
      </FilterBar>

      <div className="rounded-sm border border-neutral-200 bg-white">
        <Table>
          <thead>
            <tr>
              <Th width="96px">이미지</Th>
              <Th>매물</Th>
              <Th>지역</Th>
              <Th align="right">희망 권리금</Th>
              <Th align="right">보증금 / 월세</Th>
              <Th align="right">월매출 (양도인 공개)</Th>
              <Th>증빙 검증</Th>
              <Th>상태</Th>
              <Th>등록일</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>조건에 맞는 매물이 없습니다.</EmptyRow>}
            {rows.map((s) => {
              const sum = summaries.get(s.id);
              return (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/listings/${s.id}`}>
                      <ListingThumb storeId={s.id} hasImage={!!s.coverImagePath} industry={s.industry} className="h-14 w-20" />
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/listings/${s.id}`} className="font-medium text-neutral-900 hover:underline">{s.name}</Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-neutral-500">
                      {s.industry}
                      {s.ownerId === viewer.id && <Badge tone="neutral">내 매물</Badge>}
                      {s.isTestData && <TestDataBadge />}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{s.region}</Td>
                  <Td align="right" strong>{won(s.premium)}</Td>
                  <Td align="right" className="whitespace-nowrap">{won(s.deposit)}<span className="block text-[12px] text-neutral-500">{won(s.monthlyRent)}</span></Td>
                  <Td align="right">{s.discloseFinancials ? won(s.claimedMonthlyRevenue, "미입력") : <span className="text-neutral-400">비공개</span>}</Td>
                  <Td>{s.discloseFinancials ? <VerificationLevelBadge level={sum?.verificationLevel ?? null} /> : <span className="text-[12px] text-neutral-400">—</span>}</Td>
                  <Td><ListingStatusBadge status={s.listingStatus} /></Td>
                  <Td className="whitespace-nowrap text-[12px]">{date(s.createdAt)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
