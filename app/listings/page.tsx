"use client";

// 매물 목록: 내 매물(양도인) + 공개된 다른 매물(L0 정보만)

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import { formatDate, won } from "@/lib/format";
import type { Listing, PublicListing } from "@/lib/types";

type ListResponse = { mine: Listing[]; published: PublicListing[] };

export default function ListingsPage() {
  const user = useUser();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ListResponse>("/api/listings")
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">매물</h1>
          <p className="text-sm text-muted">지금 {user.name}로 보고 있어요.</p>
        </div>
        {user.role === "seller" && (
          <Link href="/listings/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            매물 등록
          </Link>
        )}
      </div>

      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      {!data && !error && <p className="text-sm text-muted">불러오는 중...</p>}

      {data && user.role === "seller" && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">내 매물 ({data.mine.length})</h2>
          {data.mine.length === 0 ? (
            <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">
              아직 등록한 매물이 없어요.{" "}
              <Link href="/listings/new" className="text-accent">
                매물 등록
              </Link>
            </p>
          ) : (
            <Table
              head={["매물", "업종", "희망 권리금", "보증금 / 월세", "상태", "등록일"]}
              rows={data.mine.map((l) => ({
                id: l.id,
                cells: [
                  <span key="n" className="font-medium">
                    {l.business_name ?? l.address}
                    {l.is_sample && <> <Tag>샘플</Tag></>}
                    <span className="block text-xs font-normal text-muted">{l.address}</span>
                  </span>,
                  l.business_type,
                  won(l.premium),
                  `${won(l.deposit)} / ${won(l.monthly_rent)}`,
                  l.status === "published" ? <Tag key="s" tone="outline">공개 중</Tag> : <Tag key="s">초안</Tag>,
                  formatDate(l.created_at),
                ],
              }))}
            />
          )}
        </section>
      )}

      {data && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">공개된 매물 ({data.published.length})</h2>
          {data.published.length === 0 ? (
            <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">아직 공개된 매물이 없어요.</p>
          ) : (
            <Table
              head={["위치", "업종", "희망 권리금", "보증금 / 월세", "층 · 면적", "테마"]}
              rows={data.published.map((l) => ({
                id: l.id,
                cells: [
                  <span key="a" className="font-medium">
                    {l.area}
                    {l.is_sample && <> <Tag>샘플</Tag></>}
                  </span>,
                  l.business_type,
                  won(l.premium),
                  `${won(l.deposit)} / ${won(l.monthly_rent)}`,
                  `${l.floor !== null ? `${l.floor}층` : "미입력"} · ${l.area_pyeong !== null ? `${l.area_pyeong}평` : "미입력"}`,
                  <span key="t" className="flex flex-wrap gap-1">
                    {l.themes.length ? l.themes.map((t) => <Tag key={t}>{t}</Tag>) : <span className="text-muted">-</span>}
                  </span>,
                ],
              }))}
            />
          )}
        </section>
      )}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: { id: string; cells: React.ReactNode[] }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-bg hover:bg-bg/60">
              {r.cells.map((c, i) => (
                <td key={i} className="px-4 py-3 align-top tabular-nums">
                  {i === 0 ? (
                    <Link href={`/listings/${r.id}`} className="hover:text-accent">
                      {c}
                    </Link>
                  ) : (
                    c
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
