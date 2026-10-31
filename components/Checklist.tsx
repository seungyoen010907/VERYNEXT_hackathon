"use client";

// 역할별 체크리스트 (docs/DESIGN.md 5번).
// 할 일: 순서 번호 + 태그(지금 단계 / 다음 단계 / 파일 제출), 처음 3개만 보이고 나머지는 "더 보기".
// 끝낸 항목: 덜 중요하게, 뒤로 겹쳐 쌓인 카드 모양으로 접는다.

import { useState } from "react";
import { ROLE_LABEL } from "@/components/RoleSwitch";
import { STAGES, stageTitle, templateFor } from "@/lib/roadmap";
import type { ChecklistItem, Role, StageKey } from "@/lib/types";

const VISIBLE_COUNT = 3;

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

  const others = items.filter((i) => i.role !== role);
  const otherDone = others.filter((i) => i.status !== "todo").length;
  const current = stageIndex(currentStage);

  return (
    <div className="space-y-3">
      {todo.length === 0 ? (
        <p className="rounded-xl bg-bg p-3 text-sm text-muted">지금 할 일을 모두 끝냈어요.</p>
      ) : (
        <ol className="space-y-2">
          {visibleTodo.map((item, i) => {
            const idx = stageIndex(item.stage);
            return (
              <TodoRow
                key={item.id}
                order={i + 1}
                item={item}
                role={role}
                timing={idx < current ? "late" : idx === current ? "now" : "next"}
                onUpload={onUpload}
              />
            );
          })}
        </ol>
      )}

      {todo.length > VISIBLE_COUNT && (
        <button type="button" onClick={() => setShowAllTodo(!showAllTodo)} className="w-full text-center text-sm text-accent">
          {showAllTodo ? "접기" : `할 일 ${todo.length - VISIBLE_COUNT}개 더 보기`}
        </button>
      )}

      {/* 끝낸 항목: 덜 중요하게, 카드가 뒤로 겹쳐 쌓인 모양 */}
      {done.length > 0 &&
        (showDone ? (
          <div className="space-y-1.5 pt-1">
            <button type="button" onClick={() => setShowDone(false)} className="text-xs text-muted hover:text-text">
              완료 {done.length}개 접기
            </button>
            <ul className="space-y-1">
              {done.map((item) => (
                <DoneRow key={item.id} item={item} role={role} onUpload={onUpload} />
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDone(true)}
            className={"relative block w-full pt-1 text-left " + (done.length > 2 ? "mb-3" : done.length > 1 ? "mb-1.5" : "")}
          >
            {done.length > 2 && <span className="absolute inset-x-4 -bottom-3 h-full rounded-xl bg-border/60" aria-hidden />}
            {done.length > 1 && <span className="absolute inset-x-2 -bottom-1.5 h-full rounded-xl bg-border" aria-hidden />}
            <span className="relative flex items-center justify-between gap-3 rounded-xl bg-bg px-3 py-2 text-muted">
              <span className="min-w-0">
                <span className="block text-xs font-medium">✓ 완료 {done.length}개</span>
                <span className="block truncate text-xs">{done.map((d) => d.title).join(", ")}</span>
              </span>
              <span className="shrink-0 text-xs">펼치기</span>
            </span>
          </button>
        ))}

      <p className="pt-1 text-xs text-muted">
        상대방({ROLE_LABEL[role === "buyer" ? "seller" : "buyer"]}) 진행 상황: {otherDone}/{others.length} 완료
      </p>
    </div>
  );
}

// late = 지난 단계인데 아직 안 한 것, now = 지금 단계, next = 다음 단계
function TodoRow({
  order,
  item,
  role,
  timing,
  onUpload,
}: {
  order: number;
  item: ChecklistItem;
  role: Role;
  timing: "late" | "now" | "next";
  onUpload: (item: ChecklistItem, file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const needsFile = !!templateFor(item.key)?.upload;
  const canUpload = needsFile && role === "seller";
  const active = timing !== "next";

  return (
    <li className={"rounded-xl px-3 py-2.5 " + (active ? "bg-accent/5" : "bg-bg opacity-70")}>
      <div className="flex items-start gap-2.5">
        <span
          className={
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " +
            (active ? "bg-accent text-white" : "bg-border text-muted")
          }
        >
          {order}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {timing === "now" && <Tag tone="accent">지금 단계</Tag>}
            {timing === "late" && <Tag tone="warn">밀린 할 일</Tag>}
            {timing === "next" && <Tag tone="muted">다음 단계 · {stageTitle(item.stage)}</Tag>}
            {timing !== "next" && <Tag tone="muted">{stageTitle(item.stage)}</Tag>}
            {needsFile && <Tag tone="outline">파일 제출</Tag>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            {item.guide && (
              <button type="button" onClick={() => setOpen(!open)} className="text-accent">
                {open ? "안내 닫기" : "어디서 떼나요?"}
              </button>
            )}
            {canUpload && <UploadButton item={item} onUpload={onUpload} label="파일 올리기" />}
          </div>
          {open && item.guide && <p className="mt-2 rounded-lg bg-card p-2 text-xs text-muted">{item.guide}</p>}
        </div>
      </div>
    </li>
  );
}

function DoneRow({
  item,
  role,
  onUpload,
}: {
  item: ChecklistItem;
  role: Role;
  onUpload: (item: ChecklistItem, file: File) => void;
}) {
  const canUpload = templateFor(item.key)?.upload && role === "seller";
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-muted">
      <span className="min-w-0 truncate">
        ✓ {item.title} <span className="opacity-70">· {item.status === "confirmed" ? "확인 완료" : "완료"}</span>
      </span>
      {canUpload && <UploadButton item={item} onUpload={onUpload} label="다시 올리기" />}
    </li>
  );
}

function UploadButton({
  item,
  label,
  onUpload,
}: {
  item: ChecklistItem;
  label: string;
  onUpload: (item: ChecklistItem, file: File) => void;
}) {
  return (
    <label className="shrink-0 cursor-pointer text-accent">
      {label}
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
  );
}

function Tag({ tone, children }: { tone: "accent" | "warn" | "muted" | "outline"; children: React.ReactNode }) {
  const style = {
    accent: "bg-accent text-white",
    warn: "bg-warn/10 text-warn",
    muted: "bg-border/70 text-muted",
    outline: "bg-card text-accent",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style}`}>{children}</span>;
}
