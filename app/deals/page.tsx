"use client";

// 내 거래방 목록. Step 1은 가짜 데이터, Step 3에서 GET /api/deals로 바꾼다.

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { mockDeals } from "@/lib/mock";
import { stageTitle } from "@/lib/roadmap";

export default function DealsPage() {
  const deals = mockDeals;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">내 거래방</h1>
        <Link href="/deals/new" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
          거래방 만들기
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          아직 거래방이 없어요.{" "}
          <Link href="/deals/new" className="text-accent">
            거래방 만들기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {deals.map((d) => (
            <li key={d.id}>
              <Link href={`/deals/${d.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-accent">
                <p className="text-xs text-muted">
                  {d.business_type} · {formatDate(d.created_at)}
                </p>
                <p className="mt-1 font-bold">{d.address}</p>
                <p className="mt-1 text-sm text-muted">
                  {stageTitle(d.stage)} · 내 할 일 {d.todo_count}개
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
