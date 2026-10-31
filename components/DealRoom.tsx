"use client";

// 거래방 한 화면 (docs/DESIGN.md 4번). 데스크톱은 화면 높이에 맞추고 영역 안에서만 스크롤한다.
// [왼쪽 사이드바: 체크리스트·제출된 자료, 위아래 끝까지]
// [오른쪽 패널: 제목·매물 정보·로드맵(위 고정) → 메시지(스크롤) → 입력칸(아래 고정)]
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

const VISIBLE_DOCS = 3;

export default function DealRoom({ id }: { id: string }) {
  const role = useRole();
  const deal = { ...mockDeal, id };
  const [checklist, setChecklist] = useState(mockChecklist);
  const [documents, setDocuments] = useState(mockDocuments);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const myTodo = checklist.filter((i) => i.role === role && i.status === "todo").length;

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
    // 헤더(4rem)와 main 위아래 여백(3rem)을 뺀 높이
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-7rem)] md:flex-row">
      {/* 왼쪽 사이드바: 위아래 끝까지, 안에서만 스크롤 */}
      <aside className={"flex shrink-0 flex-col gap-3 md:h-full md:min-h-0 " + (sidebarOpen ? "md:w-96" : "md:w-auto")}>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "체크리스트 닫기" : "체크리스트 열기"}
            className="flex size-9 items-center justify-center rounded-lg bg-card text-muted hover:text-text"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {sidebarOpen && <span className="text-sm text-muted">{ROLE_LABEL[role]}의 할 일과 자료</span>}
        </div>

        {sidebarOpen && (
          <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
            {/* 체크리스트 */}
            <section className="flex flex-col rounded-2xl bg-card md:min-h-0 md:flex-1">
              <SidebarHeader title="체크리스트" count={`할 일 ${myTodo}개`} />
              <div className="px-3 pb-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <Checklist items={checklist} role={role} currentStage={deal.stage} onUpload={handleUpload} />
              </div>
            </section>

            {/* 제출된 자료 */}
            <section className="flex shrink-0 flex-col rounded-2xl bg-card md:max-h-[40%]">
              <SidebarHeader title="제출된 자료" count={canSeeDocuments ? `${documents.length}개` : ""} />
              <div className="px-3 pb-3 md:min-h-0 md:overflow-y-auto">
                {!canSeeDocuments ? (
                  <p className="rounded-lg bg-bg p-3 text-sm text-muted">양도인이 자료 공개에 동의하면 볼 수 있어요.</p>
                ) : documents.length === 0 ? (
                  <p className="text-sm text-muted">아직 올린 자료가 없어요.</p>
                ) : (
                  <>
                    <ul className="space-y-1 text-sm">
                      {(showAllDocs ? documents : documents.slice(0, VISIBLE_DOCS)).map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-bg px-3 py-2">
                          <span className="min-w-0 truncate">{d.file_name}</span>
                          <span className="shrink-0 text-xs text-muted">{Math.max(1, Math.ceil(d.size / 1024))}KB</span>
                        </li>
                      ))}
                    </ul>
                    {documents.length > VISIBLE_DOCS && (
                      <button
                        type="button"
                        onClick={() => setShowAllDocs(!showAllDocs)}
                        className="mt-2 w-full text-center text-sm text-accent"
                      >
                        {showAllDocs ? "접기" : `자료 ${documents.length - VISIBLE_DOCS}개 더 보기`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </aside>

      {/* 오른쪽 패널: 위 고정(제목·로드맵) / 가운데 스크롤(메시지) / 아래 고정(입력칸) */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl bg-card md:h-full md:min-h-0">
        <div className="shrink-0 space-y-4 px-4 pt-5 pb-4 md:px-6">
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
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {info.map(([label, value]) => (
              <div key={label} className="flex gap-1.5">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl bg-bg px-2 py-3">
            <Roadmap steps={getRoadmap(deal.stage)} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <Messages initial={mockMessages} role={role} />
        </div>
      </section>
    </div>
  );
}

function SidebarHeader({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-2">
      <h2 className="font-bold">{title}</h2>
      {count && <span className="text-xs text-muted">{count}</span>}
    </div>
  );
}
