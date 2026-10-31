import { Suspense } from "react";
import { dateTime } from "@/lib/format";
import { requestContext } from "@/server/http";
import { listActivities } from "@/server/repo/activities";
import { listDeals } from "@/server/deals/repo";
import { MESSAGE_THRESHOLD } from "@/server/deals/agent";
import { getAccount } from "@/server/repo/account";
import { listRequests } from "@/server/repo/diligence";
import { visibleStoreIds } from "@/server/repo/stores";
import { HeaderSearch, Notifications, PageTitle, UserMenu, type NotificationItem } from "./header-client";

async function HeaderActions() {
  const { db, viewer } = await requestContext();
  const ids = await visibleStoreIds(db, viewer);
  const [activities, requests, deals, account] = await Promise.all([
    listActivities(db, { storeIds: ids, limit: 100 }),
    listRequests(db, ids),
    listDeals(db, viewer, "active"),
    getAccount(db, viewer),
  ]);
  const prefs = account.notificationPrefs;
  // 매물 실사 위험 알림은 내 매물에 대해서만 보여준다 (거래 중인 위험은 거래 화면에서 확인)
  const ownedIds = new Set((await db.query<{ id: string }>(`select id from stores where owner_id = $1`, [viewer.id])).map((r) => r.id));
  const items: NotificationItem[] = [
    ...(prefs.messages ? deals.filter((d) => d.unread > 0) : []).map((d) => ({
      id: `m-${d.deal.id}`,
      title: `${d.counterpartName}: ${d.lastMessage?.body.slice(0, 40) ?? ""} (읽지 않음 ${d.unread})`,
      storeName: d.store.name,
      href: `/deals/${d.deal.id}?tab=chat`,
      at: dateTime(d.lastMessage?.createdAt),
      kind: "message" as const,
    })),
    ...(prefs.ai ? deals.filter((d) => d.role === "buyer" && d.messagesSinceAnalysis >= MESSAGE_THRESHOLD) : []).map((d) => ({
      id: `a-${d.deal.id}`,
      title: `새 메시지 ${d.messagesSinceAnalysis}건: AI 거래 분석을 실행할 수 있습니다`,
      storeName: d.store.name,
      href: `/deals/${d.deal.id}?tab=chat`,
      at: dateTime(d.lastMessage?.createdAt),
      kind: "ai" as const,
    })),
    ...activities
      .filter((a) => prefs.ai && a.type === "risk_detected" && ownedIds.has(a.storeId))
      .slice(0, 4)
      .map((a) => ({ id: a.id, title: a.title, storeName: a.storeName, href: `/stores/${a.storeId}?tab=risk`, at: dateTime(a.createdAt), kind: "risk" as const })),
    ...requests
      .filter((r) => prefs.requests && r.status === "open" && r.requestedBy !== viewer.id)
      .slice(0, 4)
      .map((r) => ({ id: r.id, title: `추가 자료 요청 ${r.checklistKeys.length}건 (미제출)`, storeName: r.storeName, href: `/stores/${r.storeId}?tab=documents`, at: dateTime(r.createdAt), kind: "request" as const })),
  ];
  return (
    <>
      <Notifications items={items} />
      <UserMenu name={viewer.displayName} role={viewer.role} />
    </>
  );
}

export function Header() {
  return (
    <header className="app-header sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:px-6">
      <div className="min-w-0 flex-1">
        <Suspense fallback={null}>
          <PageTitle />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <HeaderSearch />
      </Suspense>
      <Suspense fallback={<div className="h-8 w-40" />}>
        <HeaderActions />
      </Suspense>
    </header>
  );
}
