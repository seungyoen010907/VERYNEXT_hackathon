"use client";

// 역할별 체크리스트. 내 역할 항목만 보여주고, 상대 항목은 개수만 접어서 보여준다.

import { useState } from "react";
import { ROLE_LABEL } from "@/components/RoleSwitch";
import { STAGES, templateFor } from "@/lib/roadmap";
import type { ChecklistItem, ChecklistStatus, Role, StageKey } from "@/lib/types";

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  todo: "할 일",
  done: "제출 완료",
  confirmed: "확인 완료",
};

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
  const mine = items.filter((i) => i.role === role);
  const others = items.filter((i) => i.role !== role);
  const otherDone = others.filter((i) => i.status !== "todo").length;
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="space-y-5">
      {STAGES.map((stage, stageIndex) => {
        const stageItems = mine.filter((i) => i.stage === stage.key);
        if (stageItems.length === 0) return null;
        const upcoming = stageIndex > currentIndex;
        return (
          <section key={stage.key} className={upcoming ? "opacity-60" : ""}>
            <h3 className="mb-2 text-xs font-medium text-muted">
              {stage.title}
              {upcoming && " · 아직 차례가 아니에요"}
            </h3>
            <ul className="space-y-2">
              {stageItems.map((item) => (
                <ChecklistRow key={item.id} item={item} role={role} onUpload={onUpload} />
              ))}
            </ul>
          </section>
        );
      })}

      <details className="rounded-xl border border-border p-3 text-sm">
        <summary className="cursor-pointer text-muted">
          상대방({ROLE_LABEL[role === "buyer" ? "seller" : "buyer"]}) 진행 상황: {otherDone}/{others.length} 완료
        </summary>
        <ul className="mt-2 space-y-1">
          {others.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{item.title}</span>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ChecklistRow({
  item,
  role,
  onUpload,
}: {
  item: ChecklistItem;
  role: Role;
  onUpload: (item: ChecklistItem, file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const canUpload = templateFor(item.key)?.upload && role === "seller";

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium">{item.title}</p>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
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
      {open && item.guide && <p className="mt-2 rounded-lg bg-bg p-2 text-sm text-muted">{item.guide}</p>}
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
