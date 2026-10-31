"use client";

// 거래방 한 화면 (docs/DESIGN.md 4번):
// 제목 → 매물 정보 한 줄 → 가로 로드맵 → [왼쪽 사이드바: 체크리스트·제출된 자료] + [가운데 채팅창]
// Step 1은 lib/mock.ts의 가짜 데이터를 쓰고, 업로드는 화면에만 반영한다.

import Link from "next/link";
import { useState } from "react";
import Checklist from "@/components/Checklist";
import Messages from "@/components/Messages";
import Roadmap from "@/components/Roadmap";
import { ROLE_LABEL, useRole } from "@/components/RoleSwitch";
import { formatDate, won } from "@/lib/format";
import { mockChecklist, mockDeal, mockDocuments, mockMessages } from "@/lib/mock";
import { getRoadmap } from "@/lib/roadmap";
import type { ChecklistItem, DealDocument } from "@/lib/types";

export default function DealRoom({ id }: { id: string }) {
  const role = useRole();
  const deal = { ...mockDeal, id };
  const [checklist, setChecklist] = useState(mockChecklist);
  const [documents, setDocuments] = useState(mockDocuments);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 양수인은 양도인이 동의하기 전에는 자료를 볼 수 없다 (API.md 4번)
  const canSeeDocuments = role === "seller" || deal.seller_consent;

  function handleUpload(item: ChecklistItem, file: File) {
    const doc: DealDocument = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      checklist_key: item.key,
      file_name: file.name,
      size: file.size,
    };
    setDocuments((prev) => [...prev, doc]);
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
  }

  const info = [
    ["권리금", won(deal.premium)],
    ["보증금", won(deal.deposit)],
    ["월세", won(deal.monthly_rent)],
    ["주장 월매출", won(deal.claimed_monthly_sales)],
    ["주장 월 순수익", won(deal.claimed_monthly_profit)],
    ["자료 공개", deal.consent_at ? "동의함" : "동의 전"],
  ];

  return (
    <div className="space-y-4">
      {/* 1. 제목 + 매물 정보 한 줄 */}
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {deal.business_type} · {formatDate(deal.created_at)} · 지금 {ROLE_LABEL[role]} 화면
            </p>
            <h1 className="mt-1 text-xl font-bold">{deal.address}</h1>
          </div>
          <Link
            href={`/deals/${deal.id}/report`}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            검증 리포트 보기
          </Link>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {info.map(([label, value]) => (
            <div key={label} className="flex gap-1.5">
              <dt className="text-muted">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 2. 가로 로드맵 */}
      <section className="rounded-xl border border-border bg-card px-2 py-4">
        <Roadmap steps={getRoadmap(deal.stage)} />
      </section>

      {/* 3. 왼쪽 사이드바 + 가운데 채팅창 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <aside
          className={
            "rounded-xl border border-border bg-card md:sticky md:top-4 " +
            (sidebarOpen ? "md:w-80 md:shrink-0" : "md:w-auto")
          }
        >
          <div className="flex items-center gap-2 p-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "체크리스트 닫기" : "체크리스트 열기"}
              className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-text"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {sidebarOpen && <span className="text-sm font-medium">체크리스트 · 자료</span>}
          </div>

          {sidebarOpen && (
            <div className="space-y-6 border-t border-border p-4 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted">내 체크리스트 ({ROLE_LABEL[role]})</h2>
                <Checklist items={checklist} role={role} currentStage={deal.stage} onUpload={handleUpload} />
              </section>

              <section>
                <h2 className="mb-2 text-sm font-medium text-muted">제출된 자료</h2>
                {!canSeeDocuments ? (
                  <p className="rounded-lg bg-bg p-3 text-sm text-muted">양도인이 자료 공개에 동의하면 볼 수 있어요.</p>
                ) : documents.length === 0 ? (
                  <p className="text-sm text-muted">아직 올린 자료가 없어요.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate">{d.file_name}</span>
                        <span className="shrink-0 text-xs text-muted">{Math.max(1, Math.ceil(d.size / 1024))}KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </aside>

        <section className="flex h-[70vh] min-h-[420px] min-w-0 flex-1 flex-col rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 shrink-0 text-sm font-medium text-muted">메시지</h2>
          <div className="min-h-0 flex-1">
            <Messages initial={mockMessages} role={role} />
          </div>
        </section>
      </div>
    </div>
  );
}
