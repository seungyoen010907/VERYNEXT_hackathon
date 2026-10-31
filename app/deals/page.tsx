"use client";

// 내 거래방 목록 (GET /api/deals). 거래방 = 매물 × 양수인 한 쌍.
// 양수인은 매물 데이터룸에서 "양도인과 거래방 열기"로 만들고, 양도인은 여기서 양수인별 거래방에 들어간다.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { stageTitle } from "@/lib/roadmap";
import type { DealListItem } from "@/lib/types";

export default function DealsPage() {
  const user = useUser();
  const [deals, setDeals] = useState<DealListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    apiFetch<{ deals: DealListItem[] }>("/api/deals")
      .then((d) => !stop && (setDeals(d.deals), setError(null)))
      .catch((e) => !stop && setError(e instanceof Error ? e.message : "목록을 불러오지 못했어요."));
    return () => {
      stop = true;
    };
  }, [user.id]);

  const seller = user.role === "seller";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">내 거래방</h1>
        <p className="text-sm text-muted">양도인과 양수인이 직접 대화하고 계약 단계를 함께 체크하는 곳이에요.</p>
      </div>

      {error ? (
        <p className="rounded-xl bg-card p-4 text-sm text-warn">{error}</p>
      ) : deals === null ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : deals.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          아직 거래방이 없어요.{" "}
          {seller ? (
            "양수인이 내 매물에서 거래방을 열면 여기에 보여요."
          ) : (
            <Link href="/listings" className="text-accent">
              매물에서 거래방 열기
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {deals.map((d) => (
            <li key={`${d.listing_id}:${d.buyer_id}`}>
              <Link
                href={seller ? `/deals/${d.listing_id}?buyer=${d.buyer_id}` : `/deals/${d.listing_id}`}
                className="block rounded-xl border border-border bg-card p-4 hover:border-accent"
              >
                <p className="text-xs text-muted">
                  {d.business_type} · {formatDate(d.created_at)}
                  {d.is_sample && " · 샘플"}
                  {seller && ` · ${d.buyer_name}`}
                </p>
                <p className="mt-1 font-bold">{d.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {d.completed ? "모든 단계 완료" : stageTitle(d.stage)} · 내 할 일 {d.todo_count}개
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
