import Link from "next/link";
import { DealStageBadge } from "@/components/deal/workspace-header";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, ButtonLink, TestDataBadge, cx } from "@/components/ui";
import { dateTime, won } from "@/lib/format";
import { MESSAGE_THRESHOLD } from "@/server/deals/agent";
import { listDeals, type DealFilter } from "@/server/deals/repo";
import { requestContext } from "@/server/http";

const FILTERS: Array<{ key: DealFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "buying", label: "내가 문의한 매물" },
  { key: "selling", label: "내 매물에 대한 문의" },
  { key: "active", label: "진행 중" },
  { key: "closed", label: "완료 · 중단" },
];

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const [sp, { db, viewer }] = await Promise.all([searchParams, requestContext()]);
  const f = FILTERS.find((x) => x.key === sp.filter)?.key ?? "all";
  const [rows, all] = await Promise.all([listDeals(db, viewer, f), listDeals(db, viewer, "all")]);
  const count = (k: DealFilter) =>
    k === "all" ? all.length : all.filter((d) => (k === "buying" ? d.role === "buyer" : k === "selling" ? d.role === "seller" : k === "active" ? !["completed", "cancelled"].includes(d.deal.stage) : ["completed", "cancelled"].includes(d.deal.stage))).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-1 rounded-sm border border-neutral-200 bg-white p-1" aria-label="거래 필터">
          {FILTERS.map((x) => (
            <Link key={x.key} href={`/deals?filter=${x.key}`} className={cx("rounded-sm px-3 py-1.5 text-[13px]", f === x.key ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100")}>
              {x.label} <span className="tabular-nums opacity-70">{count(x.key)}</span>
            </Link>
          ))}
        </nav>
        <ButtonLink href="/listings">매물 둘러보기</ButtonLink>
      </div>

      <div className="rounded-sm border border-neutral-200 bg-white">
        <Table>
          <thead>
            <tr>
              <Th>매물</Th>
              <Th>상대방</Th>
              <Th>최근 메시지</Th>
              <Th>최근 대화</Th>
              <Th align="right">읽지 않음</Th>
              <Th>거래 단계</Th>
              <Th>AI 분석</Th>
              <Th align="right">미완료 업무</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow colSpan={8}>
                거래가 없습니다. <Link href="/listings" className="underline">매물 둘러보기</Link>에서 관심 있는 매물에 거래 문의를 시작하세요.
              </EmptyRow>
            )}
            {rows.map((d) => (
              <Tr key={d.deal.id}>
                <Td>
                  <Link href={`/deals/${d.deal.id}?tab=chat`} className="font-medium text-neutral-900 hover:underline">{d.store.name}</Link>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-neutral-500">
                    {d.role === "buyer" ? "내가 문의" : "내 매물"} · 권리금 {won(d.deal.terms.premium, "미정")}
                    {d.store.isTestData && <TestDataBadge />}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  {d.counterpartName}
                  <span className="block text-[11px] text-neutral-500">{d.role === "buyer" ? "양도인" : "양수인"}</span>
                </Td>
                <Td className="max-w-72 text-[12px]">
                  <span className="line-clamp-2 text-neutral-700">
                    {d.lastMessage ? (d.lastMessage.kind === "file" ? `[파일] ${d.lastMessage.body}` : d.lastMessage.body) : "—"}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-[12px]">{dateTime(d.lastMessage?.createdAt ?? d.deal.createdAt)}</Td>
                <Td align="right">{d.unread > 0 ? <Badge tone="critical">{d.unread}</Badge> : <span className="text-neutral-400">0</span>}</Td>
                <Td><DealStageBadge stage={d.deal.stage} /></Td>
                <Td className="text-[12px]">
                  {d.role === "seller" ? (
                    <span className="text-neutral-400">—</span>
                  ) : d.messagesSinceAnalysis >= MESSAGE_THRESHOLD ? (
                    <Badge tone="caution">분석 가능 (새 메시지 {d.messagesSinceAnalysis})</Badge>
                  ) : d.openFindings.total > 0 ? (
                    <span>위험 {d.openFindings.total}건{d.openFindings.serious > 0 && <span className="text-red-700"> · HIGH 이상 {d.openFindings.serious}</span>}</span>
                  ) : (
                    <span className="text-neutral-500">새 메시지 {d.messagesSinceAnalysis}/{MESSAGE_THRESHOLD}</span>
                  )}
                </Td>
                <Td align="right">{d.openTasks}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
