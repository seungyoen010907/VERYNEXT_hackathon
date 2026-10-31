import Link from "next/link";
import { RISK_LEVEL_ORDER, type RiskLevel } from "@/types/domain";
import { DealStageBadge } from "@/components/deal/workspace-header";
import { RiskBadge } from "@/components/status";
import { EmptyRow, Table, Td, Th, Tr } from "@/components/table";
import { Badge, ButtonLink, Kpi, KpiRow, Notice, Panel, Progress, TestDataBadge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { MESSAGE_THRESHOLD } from "@/server/deals/agent";
import { listDeals } from "@/server/deals/repo";
import { requestContext } from "@/server/http";
import { listActivities } from "@/server/repo/activities";
import { listListings } from "@/server/repo/stores";
import { storeOverviews } from "@/server/views";

export default async function DashboardPage() {
  const { db, viewer } = await requestContext();
  const [deals, managed, listings] = await Promise.all([listDeals(db, viewer, "all"), storeOverviews(db, viewer, {}, { managed: true }), listListings(db)]);
  const active = deals.filter((d) => !["completed", "cancelled"].includes(d.deal.stage));
  const owned = managed.filter((o) => o.canEdit);
  const dealIds = deals.map((d) => d.deal.id);

  const [taskRows, findings, events, storeActs] = await Promise.all([
    dealIds.length
      ? db.query<{ deal_id: string; total: number; done: number; needs: number }>(
          `select deal_id, count(*)::int as total, count(*) filter (where status = 'done')::int as done,
                  count(*) filter (where status in ('requested','needs_more'))::int as needs
             from deal_tasks where deal_id = any($1::uuid[]) group by deal_id`,
          [`{${dealIds.join(",")}}`],
        )
      : Promise.resolve([]),
    // 양수인으로 참여한 거래의 열린 AI 위험 (양도인에게는 보이지 않는다)
    db.query<{ id: string; deal_id: string; level: RiskLevel; title: string; updated_at: string; store_name: string }>(
      `select f.id, f.deal_id, f.level, f.title, f.updated_at, s.name as store_name
         from deal_ai_findings f join deals d on d.id = f.deal_id join stores s on s.id = d.store_id
        where d.buyer_id = $1 and f.status = 'open'`,
      [viewer.id],
    ),
    db.query<{ id: string; deal_id: string; title: string; type: string; created_at: string; store_name: string }>(
      `select e.id, e.deal_id, e.title, e.type, e.created_at, s.name as store_name
         from deal_events e join deals d on d.id = e.deal_id join stores s on s.id = d.store_id
        where (d.seller_id = $1 or d.buyer_id = $1)
          and (d.buyer_id = $1 or e.type not in ('ai_risk_found', 'ai_risk_resolved', 'ai_analysis_completed'))
        order by e.created_at desc limit 12`,
      [viewer.id],
    ),
    listActivities(db, { storeIds: owned.map((o) => o.store.id), limit: 8 }),
  ]);
  const tasksBy = new Map(taskRows.map((t) => [t.deal_id, t]));
  const needsDocs = viewer.role === "buyer" ? active.filter((d) => (tasksBy.get(d.deal.id)?.needs ?? 0) > 0).length : owned.filter((o) => o.store.status === "needs_more_documents").length;
  const topFindings = findings.sort((a, b) => RISK_LEVEL_ORDER[b.level] - RISK_LEVEL_ORDER[a.level]).slice(0, 6);
  const storeRisks = owned
    .filter((o) => o.summary && o.summary.riskCounts.CRITICAL + o.summary.riskCounts.HIGH > 0)
    .map((o) => ({ store: o.store, level: o.summary!.overallRisk, n: o.summary!.riskCounts.CRITICAL + o.summary!.riskCounts.HIGH }));
  const alerts = [
    ...active.filter((d) => d.unread > 0).map((d) => ({ key: `u${d.deal.id}`, dealId: d.deal.id, store: d.store.name, text: `${d.counterpartName}: ${d.lastMessage?.body.slice(0, 60) ?? ""}`, tag: <Badge tone="critical">새 메시지 {d.unread}</Badge>, at: d.lastMessage?.createdAt ?? null })),
    ...active.filter((d) => d.role === "buyer" && d.messagesSinceAnalysis >= MESSAGE_THRESHOLD).map((d) => ({ key: `a${d.deal.id}`, dealId: d.deal.id, store: d.store.name, text: `마지막 분석 이후 새 메시지 ${d.messagesSinceAnalysis}건`, tag: <Badge tone="caution">AI 분석 가능</Badge>, at: d.lastMessage?.createdAt ?? null })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-neutral-600">{viewer.displayName} · {viewer.role === "seller" ? "양도인" : "양수인"} 기준</p>
        <div className="flex gap-2">
          <ButtonLink href="/listings">매물 둘러보기</ButtonLink>
          {viewer.role !== "buyer" && <ButtonLink href="/stores/new" variant="primary">매물 등록</ButtonLink>}
        </div>
      </div>

      <KpiRow>
        <Kpi label={viewer.role === "buyer" ? "전체 매물 (공개)" : "내 매물"} value={viewer.role === "buyer" ? listings.length : owned.length} sub={viewer.role === "buyer" ? `문의한 매물 ${deals.length}` : `공개 매물 전체 ${listings.length}`} href={viewer.role === "buyer" ? "/listings" : "/stores"} />
        <Kpi label="진행 중인 거래" value={active.length} sub={`읽지 않은 대화 ${active.filter((d) => d.unread > 0).length}건`} href="/deals?filter=active" />
        <Kpi label="검증 완료" value={managed.filter((o) => o.store.status === "verified").length} sub={viewer.role === "buyer" ? "거래 중인 매물 기준" : "내 매물 기준"} href="/diligence" />
        <Kpi label="추가 자료 필요" value={needsDocs} sub={viewer.role === "buyer" ? "요청·보완 대기 업무가 있는 거래" : "보완이 필요한 내 매물"} emphasis={needsDocs > 0} href={viewer.role === "buyer" ? "/deals?filter=active" : "/stores?status=needs_more_documents"} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="진행 중인 거래 · 실사" flush actions={<Link href="/deals" className="text-[12px] underline">거래 관리</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>매물</Th>
                <Th>상대방</Th>
                <Th>단계</Th>
                <Th width="28%">실사 체크리스트</Th>
                <Th align="right">요청·보완</Th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 && (
                <EmptyRow colSpan={5}>
                  진행 중인 거래가 없습니다. {viewer.role === "buyer" ? <Link href="/listings" className="underline">매물 둘러보기</Link> : "매물을 공개하면 양수인이 문의할 수 있습니다."}
                </EmptyRow>
              )}
              {active.slice(0, 8).map((d) => {
                const t = tasksBy.get(d.deal.id);
                const pct = t?.total ? Math.round((t.done / t.total) * 100) : 0;
                return (
                  <Tr key={d.deal.id}>
                    <Td>
                      <Link href={`/deals/${d.deal.id}?tab=overview`} className="font-medium hover:underline">{d.store.name}</Link>
                      {d.store.isTestData && <span className="ml-1"><TestDataBadge /></span>}
                    </Td>
                    <Td className="whitespace-nowrap text-[12px]">{d.counterpartName}<span className="block text-neutral-500">{d.role === "buyer" ? "양도인" : "양수인"}</span></Td>
                    <Td><DealStageBadge stage={d.deal.stage} /></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} />
                        <span className="w-14 text-right text-[12px] tabular-nums">{t?.done ?? 0}/{t?.total ?? 0}</span>
                      </div>
                    </Td>
                    <Td align="right">{t?.needs ?? 0}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>

        <Panel title="거래 메시지 · AI 분석 알림" flush>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-neutral-500">새 메시지나 분석 가능한 거래가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {alerts.slice(0, 8).map((a) => (
                <li key={a.key}>
                  <Link href={`/deals/${a.dealId}?tab=chat`} className="block px-4 py-2 hover:bg-neutral-50">
                    <span className="flex items-center gap-2 text-[11px] text-neutral-500">
                      {a.tag}
                      <span className="truncate">{a.store}</span>
                      <span className="ml-auto whitespace-nowrap">{dateTime(a.at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px]">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="주요 위험 항목" flush actions={<Link href="/risk" className="text-[12px] underline">위험도 현황</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>수준</Th>
                <Th>매물</Th>
                <Th>내용</Th>
              </tr>
            </thead>
            <tbody>
              {topFindings.map((f) => (
                <Tr key={f.id}>
                  <Td><RiskBadge level={f.level} /></Td>
                  <Td className="whitespace-nowrap text-[12px]">{f.store_name}</Td>
                  <Td><Link href={`/deals/${f.deal_id}?tab=tasks`} className="hover:underline">{f.title}</Link></Td>
                </Tr>
              ))}
              {storeRisks.map((r) => (
                <Tr key={r.store.id}>
                  <Td><RiskBadge level={r.level} /></Td>
                  <Td className="whitespace-nowrap text-[12px]">{r.store.name}</Td>
                  <Td><Link href={`/stores/${r.store.id}?tab=analysis&sub=risk`} className="hover:underline">매물 실사: HIGH 이상 위험 {r.n}건</Link></Td>
                </Tr>
              ))}
              {topFindings.length + storeRisks.length === 0 && <EmptyRow colSpan={3}>HIGH 이상 위험이 없습니다.</EmptyRow>}
            </tbody>
          </Table>
        </Panel>

        <Panel title="자료 제출 현황" flush actions={<Link href="/documents" className="text-[12px] underline">자료 제출 현황</Link>}>
          <Table>
            <thead>
              <tr>
                <Th>매물</Th>
                <Th align="right">필수 자료</Th>
                <Th>미제출</Th>
              </tr>
            </thead>
            <tbody>
              {managed.length === 0 && <EmptyRow colSpan={3}>관리 중인 매물이 없습니다.</EmptyRow>}
              {managed.slice(0, 8).map((o) => {
                const c = o.progress.checklist;
                const missing = c.items.filter((i) => i.required && (i.state === "missing" || i.state === "failed"));
                return (
                  <Tr key={o.store.id}>
                    <Td><Link href={o.href} className="hover:underline">{o.store.name}</Link></Td>
                    <Td align="right" strong>{c.submittedCount}/{c.requiredCount}</Td>
                    <Td className="text-[12px]">{missing.length ? <span className="text-red-700">{missing.map((m) => m.label).join(", ")}</span> : <span className="text-neutral-400">없음</span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      </div>

      <Panel title="최근 활동" flush>
        <ol className="divide-y divide-neutral-100">
          {[
            ...events.map((e) => ({ id: e.id, at: e.created_at, store: e.store_name, title: e.title, href: `/deals/${e.deal_id}?tab=overview`, kind: "거래" })),
            ...storeActs.map((a) => ({ id: a.id, at: a.createdAt, store: a.storeName, title: a.title, href: `/stores/${a.storeId}`, kind: "내 매물" })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 10)
            .map((a) => (
              <li key={a.id} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 px-4 py-2 text-[13px]">
                <time className="text-[12px] tabular-nums text-neutral-500">{dateTime(a.at)}</time>
                <Link href={a.href} className="min-w-0 hover:underline">
                  <span className="text-[11px] text-neutral-500">{a.kind} · {a.store}</span>
                  <span className="block truncate">{a.title}</span>
                </Link>
              </li>
            ))}
          {events.length + storeActs.length === 0 && <li className="px-4 py-6 text-center text-[12px] text-neutral-500">활동 기록이 없습니다.</li>}
        </ol>
      </Panel>

      <Notice>[테스트] 표시가 있는 매물과 거래는 시연용 가상 데이터입니다. AI 분석은 외부 AI 없이 규칙 기반 엔진으로 동작합니다.</Notice>
    </div>
  );
}
