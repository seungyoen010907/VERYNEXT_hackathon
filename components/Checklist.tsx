"use client";

// 역할별 체크리스트 (docs/DESIGN.md 5번).
// 할 일은 3개만 보이고 나머지는 "더 보기", 끝낸 항목은 뒤로 겹쳐 쌓인 카드 모양으로 접는다.

import { useState } from "react";
import { ROLE_LABEL } from "@/components/RoleSwitch";
import { STAGES, stageTitle, templateFor } from "@/lib/roadmap";
import type { ChecklistItem, ChecklistStatus, Role, StageKey } from "@/lib/types";

const VISIBLE_COUNT = 3;

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  todo: "할 일",
  done: "제출 완료",
  confirmed: "확인 완료",
};

const stageIndex = (key: StageKey) => STAGES.findIndex((s) => s.key === key);

export default function Checklist({
  items,
  role,
  currentStage,
  onUpload,
}: {
  items: ChecklistItem[];
  role: Role;
  currentStage: StageKey;
  onUpload: (item: ChecklistItem, file: File) => void;
}) {
  const [showAllTodo, setShowAllTodo] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const mine = items.filter((i) => i.role === role).sort((a, b) => a.sort - b.sort);
  const todo = mine.filter((i) => i.status === "todo");
  const done = mine.filter((i) => i.status !== "todo");
  const visibleTodo = showAllTodo ? todo : todo.slice(0, VISIBLE_COUNT);
  const hiddenCount = todo.length - visibleTodo.length;

  const others = items.filter((i) => i.role !== role);
  const otherDone = others.filter((i) => i.status !== "todo").length;
  const current = stageIndex(currentStage);

  return (
    <div className="space-y-3">
      {todo.length === 0 ? (
        <p className="rounded-lg bg-bg p-3 text-sm text-muted">지금 할 일을 모두 끝냈어요.</p>
      ) : (
        <ul className="space-y-2">
          {visibleTodo.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              role={role}
              upcoming={stageIndex(item.stage) > current}
              onUpload={onUpload}
            />
          ))}
        </ul>
      )}

      {todo.length > VISIBLE_COUNT && (
        <button type="button" onClick={() => setShowAllTodo(!showAllTodo)} className="w-full text-center text-sm text-accent">
          {showAllTodo ? "접기" : `할 일 ${hiddenCount}개 더 보기`}
        </button>
      )}

      {/* 끝낸 항목: 카드가 뒤로 겹쳐 쌓인 모양 */}
      {done.length > 0 &&
        (showDone ? (
          <div className="space-y-2">
            <button type="button" onClick={() => setShowDone(false)} className="text-sm text-muted hover:text-text">
              완료 {done.length}개 접기
            </button>
            <ul className="space-y-2">
              {done.map((item) => (
                <ChecklistRow key={item.id} item={item} role={role} upcoming={false} onUpload={onUpload} />
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDone(true)}
            className={"relative block w-full text-left " + (done.length > 2 ? "mb-3" : done.length > 1 ? "mb-1.5" : "")}
          >
            {done.length > 2 && (
              <span className="absolute inset-x-4 -bottom-3 h-full rounded-xl border border-border bg-bg" aria-hidden />
            )}
            {done.length > 1 && (
              <span className="absolute inset-x-2 -bottom-1.5 h-full rounded-xl border border-border bg-card" aria-hidden />
            )}
            <span className="relative flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium">완료 {done.length}개</span>
                <span className="block truncate text-xs text-muted">{done.map((d) => d.title).join(", ")}</span>
              </span>
              <span className="shrink-0 text-xs text-accent">펼치기</span>
            </span>
          </button>
        ))}

      <p className="pt-1 text-xs text-muted">
        상대방({ROLE_LABEL[role === "buyer" ? "seller" : "buyer"]}) 진행 상황: {otherDone}/{others.length} 완료
      </p>
    </div>
  );
}

function ChecklistRow({
  item,
  role,
  upcoming,
  onUpload,
}: {
  item: ChecklistItem;
  role: Role;
  upcoming: boolean;
  onUpload: (item: ChecklistItem, file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const canUpload = templateFor(item.key)?.upload && role === "seller";

  return (
    <li className={"rounded-xl border border-border bg-card px-3 py-2 " + (upcoming ? "opacity-60" : "")}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium">{item.title}</p>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted">
          {stageTitle(item.stage)}
          {upcoming && " · 아직 차례 아님"}
        </span>
        {item.guide && (
          <button type="button" onClick={() => setOpen(!open)} className="text-accent">
            {open ? "안내 닫기" : "어디서 떼나요?"}
          </button>
        )}
        {canUpload && (
          <label className="cursor-pointer text-accent">
            {item.status === "todo" ? "파일 올리기" : "다시 올리기"}
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(item, file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {open && item.guide && <p className="mt-2 rounded-lg bg-bg p-2 text-xs text-muted">{item.guide}</p>}
    </li>
  );
}

function StatusBadge({ status }: { status: ChecklistStatus }) {
  return (
    <span
      className={
        "shrink-0 rounded-full px-2 py-0.5 text-xs " +
        (status === "todo" ? "border border-border text-muted" : "bg-accent/10 text-accent")
      }
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
