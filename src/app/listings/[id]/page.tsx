import Link from "next/link";
import { notFound } from "next/navigation";
import { StartDealButton } from "@/components/client/deal-actions";
import { ListingThumb } from "@/components/listing-thumb";
import { ChecklistStateBadge, ListingStatusBadge, VerificationLevelBadge } from "@/components/status";
import { Table, Td, Th, Tr } from "@/components/table";
import { ButtonLink, DefinitionList, Notice, Panel, TestDataBadge } from "@/components/ui";
import { date, dateTime, months, pct, won } from "@/lib/format";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";
import { latestAnalysisSummaries } from "@/server/repo/analyses";
import { getChecklist } from "@/server/repo/diligence";
import { getStore } from "@/server/repo/stores";

/** 매물 상세 (공개 정보). 양도인이 공개한 정보와 증빙 검증 상태만 보여준다. 원본 증빙 문서는 보여주지 않는다. */
export default async function ListingPage({ params }: PageProps<"/listings/[id]">) {
  const [{ id }, { db, viewer }] = await Promise.all([params, requestContext()]);
  const store = await getStore(db, viewer, id).catch((err) => {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  });
  const isOwner = store.ownerId === viewer.id;
  const [summaries, checklist, existing, seller] = await Promise.all([
    latestAnalysisSummaries(db, [store.id]),
    getChecklist(db, store),
    db.query<{ id: string }>(`select id from deals where store_id = $1 and buyer_id = $2`, [store.id, viewer.id]),
    db.query<{ display_name: string }>(`select display_name from users where id = $1`, [store.ownerId]),
  ]);
  const summary = summaries.get(store.id) ?? null;
  const inquiries = isOwner ? await db.query<{ n: number }>(`select count(*)::int as n from deals where store_id = $1`, [store.id]) : [];

  return (
    <div className="space-y-4">
      <nav className="text-[12px] text-neutral-500">
        <Link href="/listings" className="hover:text-neutral-900">매물 둘러보기</Link> / <span className="text-neutral-800">{store.name}</span>
      </nav>
      {!store.isPublished && <Notice tone="caution">비공개 매물입니다. {isOwner ? "공개하면 양수인이 검색할 수 있습니다." : "진행 중인 거래가 있어 볼 수 있습니다."}</Notice>}
      {store.isTestData && <Notice>시연·테스트용 가상 매물입니다. 실제 점포가 아닙니다.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-sm border border-neutral-200 bg-white">
            <div className="grid gap-4 p-5 sm:grid-cols-[220px_minmax(0,1fr)]">
              <ListingThumb storeId={store.id} hasImage={!!store.coverImagePath} industry={store.industry} className="h-40 w-full" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{store.name}</h2>
                  <ListingStatusBadge status={store.listingStatus} />
                  {store.isTestData && <TestDataBadge />}
                </div>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {store.industry} · {store.address} · 영업 {months(store.businessPeriodMonths)} · 등록 {date(store.createdAt)}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">{store.description || "점포 소개가 없습니다."}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 border-t border-neutral-200 sm:grid-cols-4">
              {[
                ["희망 권리금", won(store.premium)],
                ["보증금", won(store.deposit)],
                ["월세", won(store.monthlyRent)],
                ["양도인", seller[0]?.display_name ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-r border-neutral-100 px-5 py-2.5 sm:border-b-0">
                  <dt className="text-[11px] text-neutral-500">{k}</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Panel title="매출 · 수익 정보 (양도인 공개)" description="양도인 주장값과, 제출된 증빙으로 계산한 값을 구분해 보여줍니다.">
            {!store.discloseFinancials ? (
              <p className="text-[12px] text-neutral-500">양도인이 매출·수익 정보를 공개하지 않았습니다. 거래 문의 후 대화에서 요청할 수 있습니다.</p>
            ) : (
              <DefinitionList
                columns={4}
                items={[
                  ["주장 월매출", won(store.claimedMonthlyRevenue, "미입력")],
                  ["주장 월순수익", won(store.claimedMonthlyNetProfit, "미입력")],
                  ["증빙 기준 월매출", summary ? won(summary.avgRevenue, "확인 불가") : "분석 전"],
                  ["증빙 기준 영업이익률", summary ? pct(summary.avgOperatingMargin, 1, "계산 불가") : "분석 전"],
                ]}
              />
            )}
            {store.discloseFinancials && summary && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-neutral-600">
                검증 수준 <VerificationLevelBadge level={summary.verificationLevel} /> · 최근 분석 {dateTime(summary.completedAt)}
                {summary.missingData.length > 0 && ` · 부족한 자료: ${summary.missingData.join(", ")}`}
              </p>
            )}
          </Panel>

          <Panel title="공개된 증빙자료 및 검증 상태" flush description="제출 여부만 표시합니다. 원본 파일은 거래 대화에서 양도인이 공유한 경우에만 볼 수 있습니다.">
            <Table>
              <thead>
                <tr>
                  <Th>자료</Th>
                  <Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {checklist.items.map((i) => (
                  <Tr key={i.key}>
                    <Td>{i.label}</Td>
                    <Td><ChecklistStateBadge state={i.state} required={i.required} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="시설 · 인테리어 / 기타 거래 조건">
            <DefinitionList
              columns={2}
              items={[
                ["시설 및 인테리어", <span key="f" className="whitespace-pre-wrap">{store.facilityDescription || "입력되지 않음"}</span>],
                ["기타 거래 조건", <span key="c" className="whitespace-pre-wrap">{store.dealConditions || "입력되지 않음"}</span>],
              ]}
            />
          </Panel>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <Panel title={isOwner ? "내 매물" : "거래 문의"}>
            {isOwner ? (
              <div className="space-y-2">
                <p className="text-[12px] text-neutral-600">이 매물에 대한 거래 문의 {inquiries[0]?.n ?? 0}건</p>
                <ButtonLink href={`/stores/${store.id}`} variant="primary" className="w-full">매물 관리</ButtonLink>
                <ButtonLink href={`/stores/${store.id}?tab=deals`} className="w-full">거래 문의 보기</ButtonLink>
              </div>
            ) : (
              <StartDealButton
                storeId={store.id}
                existingDealId={existing[0]?.id ?? null}
                disabled={store.listingStatus === "closed"}
                reason="거래가 완료된 매물입니다."
              />
            )}
          </Panel>
          <p className="px-1 text-[11px] leading-relaxed text-neutral-500">표시된 매출·수익은 양도인이 입력하거나 제출한 자료로 계산한 값이며, 플랫폼이 보증하지 않습니다.</p>
        </aside>
      </div>
    </div>
  );
}
