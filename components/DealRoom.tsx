"use client";

// 거래방 한 화면 (docs/DESIGN.md 4번). 거래방 = 매물 × 양수인 한 쌍 (PRD 11.2).
// 데스크톱은 화면 높이에 맞추고 영역 안에서만 스크롤한다.
// [왼쪽 사이드바: 체크리스트·자료 안내, 위아래 끝까지]
// [오른쪽 패널: 제목·매물 정보·로드맵(위 고정) → 메시지(스크롤) → 입력칸(아래 고정)]

import Link from "next/link";
import { useEffect, useState } from "react";
import Checklist from "@/components/Checklist";
import Messages from "@/components/Messages";
import Roadmap from "@/components/Roadmap";
import { ROLE_LABEL, useUser } from "@/components/RoleSwitch";
import { apiFetch } from "@/lib/api-client";
import { won } from "@/lib/format";
import { getRoadmap, stageTitle, templateFor } from "@/lib/roadmap";
import type { ChecklistItem, ChecklistStatus, Listing, PublicListing, Role, StageKey } from "@/lib/types";

type Room = {
  listing: Listing | PublicListing;
  is_owner: boolean;
  my_role: Role;
  buyer: { id: string; name: string };
  checklist: ChecklistItem[];
  stage: StageKey;
  completed: boolean;
};

export default function DealRoom({ id, buyer }: { id: string; buyer: string | null }) {
  const user = useUser();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const buyerQuery = buyer ? `buyer=${encodeURIComponent(buyer)}` : "";

  // 데모 사용자를 바꾸면 그 사람 권한으로 다시 불러온다
  useEffect(() => {
    let stop = false;
    apiFetch<Room>(`/api/deals/${id}${buyerQuery ? `?${buyerQuery}` : ""}`)
      .then((data) => !stop && (setRoom(data), setError(null)))
      .catch((e: Error) => !stop && (setRoom(null), setError(e.message)));
    return () => {
      stop = true;
    };
  }, [id, buyerQuery, user.id]);

  async function setStatus(item: ChecklistItem, status: ChecklistStatus) {
    setBusyId(item.id);
    setError(null);
    try {
      const data = await apiFetch<Pick<Room, "checklist" | "stage" | "completed">>(
        `/api/deals/${id}/checklist/${item.id}${buyerQuery ? `?${buyerQuery}` : ""}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setRoom((prev) => (prev ? { ...prev, ...data } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {error ? (
          <>
            <p className="rounded-xl bg-card p-4 text-sm text-warn">{error}</p>
            <Link href="/deals" className="text-sm text-accent">
              ← 내 거래방 목록
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted">불러오는 중...</p>
        )}
      </div>
    );
  }

  const role = room.my_role;
  const l = room.listing;
  const full = room.is_owner ? (l as Listing) : null;
  const title = full ? (full.business_name ?? full.address) : `${(l as PublicListing).area} ${l.business_type}`;
  // lib/deals.ts todoCount와 같은 규칙: 양수인은 '확인 완료'를 기다리는 인수인계 항목도 센다
  const myTodo = room.checklist.filter((i) =>
    role === "buyer" && templateFor(i.key)?.confirm ? i.status === "done" : i.role === role && i.status === "todo",
  ).length;
  const steps = getRoadmap(room.stage).map((s) => (room.completed ? { ...s, status: "done" as const } : s));

  const info: [string, string][] = [
    ["권리금", won(l.premium)],
    ["보증금", won(l.deposit)],
    ["월세", won(l.monthly_rent)],
    ["지금 단계", room.completed ? "모두 완료" : stageTitle(room.stage)],
  ];
  if (full) info.push(["양수인", room.buyer.name]);

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
                {error && <p className="mb-2 rounded-lg bg-bg p-2 text-xs text-warn">{error}</p>}
                <Checklist
                  items={room.checklist}
                  role={role}
                  currentStage={room.stage}
                  listingId={l.id}
                  busyId={busyId}
                  onSet={setStatus}
                />
              </div>
            </section>

            {/* 자료: 데이터룸이 권한(공개 등급·NDA·승인)을 지키므로 여기서는 링크만 둔다 */}
            <section className="flex shrink-0 flex-col gap-2 rounded-2xl bg-card p-4">
              <h2 className="font-bold">자료</h2>
              <p className="text-sm text-muted">
                {room.is_owner
                  ? "자료는 데이터룸에 올리고 공개 등급을 정해요. 양수인에게 공개한(L0~L2) 자료만 체크리스트에 반영돼요."
                  : "양도인이 공개한 자료는 데이터룸에서 볼 수 있어요. 잠긴 자료는 NDA 동의나 열람 요청이 필요해요."}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href={`/listings/${l.id}`} className="text-accent">
                  데이터룸 보기
                </Link>
                {room.is_owner ? (
                  <Link href={`/listings/${l.id}/requests`} className="text-accent">
                    구매자 요청 관리
                  </Link>
                ) : (
                  <Link href={`/listings/${l.id}/report`} className="text-accent">
                    AI 실사 리포트
                  </Link>
                )}
              </div>
            </section>
          </div>
        )}
      </aside>

      {/* 오른쪽 패널: 위 고정(제목·로드맵) / 가운데 스크롤(메시지) / 아래 고정(입력칸) */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl bg-card md:h-full md:min-h-0">
        <div className="shrink-0 space-y-4 px-4 pt-5 pb-4 md:px-6">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              거래방 · {l.business_type} · 지금 {ROLE_LABEL[role]} 화면
              {l.is_sample && " · 샘플 데이터"}
            </p>
            <h1 className="mt-1 text-xl font-bold">{title}</h1>
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
            <Roadmap steps={steps} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <Messages key={`${user.id}:${l.id}:${buyerQuery}`} listingId={l.id} buyerQuery={buyerQuery} role={role} />
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
