import { Suspense } from "react";
import { dateTime } from "@/lib/format";
import { requestContext } from "@/server/http";
import { listActivities } from "@/server/repo/activities";
import { listRequests } from "@/server/repo/diligence";
import { visibleStoreIds } from "@/server/repo/stores";
import { HeaderSearch, Notifications, PageTitle, UserMenu, type NotificationItem } from "./header-client";

async function HeaderActions() {
  const { db, viewer } = await requestContext();
  const ids = await visibleStoreIds(db, viewer);
  const [activities, requests] = await Promise.all([
    listActivities(db, { storeIds: ids, limit: 100 }),
    listRequests(db, ids),
  ]);
  const items: NotificationItem[] = [
    ...activities
      .filter((a) => a.type === "risk_detected")
      .slice(0, 6)
      .map((a) => ({ id: a.id, title: a.title, storeName: a.storeName, href: `/stores/${a.storeId}?tab=risk`, at: dateTime(a.createdAt), kind: "risk" as const })),
    ...requests
      .filter((r) => r.status === "open")
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
