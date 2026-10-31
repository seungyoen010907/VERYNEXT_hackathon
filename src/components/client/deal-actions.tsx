"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEAL_STAGE_LABELS, DEAL_STAGES, DEAL_TASK_STATUS_LABELS, DEAL_TASK_STATUSES, type DealStage, type DealTaskStatus, type DealTerms } from "@/types/domain";
import { Button, Field, Notice, Select, inputClass } from "../ui";
import { api } from "./api";

/** 매물 상세의 '거래 문의하기': 거래를 만들거나 기존 거래로 이동한다 */
export function StartDealButton({ storeId, existingDealId, disabled, reason }: { storeId: string; existingDealId: string | null; disabled?: boolean; reason?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (existingDealId) {
    return (
      <Button variant="primary" className="w-full" onClick={() => router.push(`/deals/${existingDealId}?tab=chat`)}>
        진행 중인 거래 대화로 이동
      </Button>
    );
  }
  if (disabled) return <Notice tone="caution">{reason}</Notice>;
  async function start() {
    setPending(true);
    setError(null);
    try {
      const r = await api<{ deal: { id: string } }>("/api/deals", { method: "POST", json: { storeId, message: message.trim() || undefined } });
      router.push(`/deals/${r.deal.id}?tab=chat`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "거래를 시작하지 못했습니다.");
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      {open && (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="첫 메시지 (선택). 예: 매물 보고 연락드립니다. 최근 매출 자료를 볼 수 있을까요?"
          className={`${inputClass} h-auto py-2`}
        />
      )}
      <Button variant="primary" className="h-10 w-full text-[14px]" disabled={pending} onClick={() => (open ? start() : setOpen(true))}>
        {pending ? "대화방 만드는 중…" : open ? "문의 보내고 대화 시작" : "거래 문의하기"}
      </Button>
      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <p className="text-[11px] leading-relaxed text-neutral-500">문의하면 양도인과 1:1 거래 대화방이 만들어집니다. 대화와 공유 자료는 AI 실사 분석에 사용됩니다.</p>
    </div>
  );
}

export function StageControl({ dealId, stage }: { dealId: string; stage: DealStage }) {
  const router = useRouter();
  const [value, setValue] = useState<DealStage>(stage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (value === stage) return;
    if ((value === "completed" || value === "cancelled") && !confirm(`거래를 '${DEAL_STAGE_LABELS[value]}'로 바꿉니다. 이후 메시지를 보낼 수 없습니다.`)) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/deals/${dealId}/stage`, { method: "POST", json: { stage: value } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Select value={value} onChange={(e) => setValue(e.target.value as DealStage)} className="h-8 w-32" aria-label="거래 단계" disabled={stage === "completed"}>
        {DEAL_STAGES.map((s) => (
          <option key={s} value={s}>
            {DEAL_STAGE_LABELS[s]}
          </option>
        ))}
      </Select>
      <Button disabled={pending || value === stage} onClick={save}>
        단계 변경
      </Button>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </div>
  );
}

export function TaskStatusSelect({ dealId, taskId, status }: { dealId: string; taskId: string; status: DealTaskStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <select
      value={status}
      disabled={pending}
      aria-label="업무 상태"
      onChange={async (e) => {
        setPending(true);
        try {
          await api(`/api/deals/${dealId}/tasks/${taskId}`, { method: "PATCH", json: { status: e.target.value } });
          router.refresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : "변경하지 못했습니다.");
        } finally {
          setPending(false);
        }
      }}
      className="h-7 rounded-sm border border-neutral-300 bg-white px-1.5 text-[12px]"
    >
      {DEAL_TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {DEAL_TASK_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function TaskDueInput({ dealId, taskId, dueDate }: { dealId: string; taskId: string; dueDate: string | null }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={dueDate ?? ""}
      aria-label="마감일"
      onChange={async (e) => {
        await api(`/api/deals/${dealId}/tasks/${taskId}`, { method: "PATCH", json: { dueDate: e.target.value || null } }).catch(() => undefined);
        router.refresh();
      }}
      className="h-7 rounded-sm border border-neutral-300 bg-white px-1.5 text-[12px]"
    />
  );
}

export function AddTaskForm({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState("operation");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setPending(true);
        try {
          await api(`/api/deals/${dealId}/tasks`, { method: "POST", json: { title, taskGroup: group, assigneeRole: "buyer", requestTargetRole: "seller" } });
          setTitle("");
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="업무 추가" className="min-w-64 flex-1">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="예: 주방 설비 작동 여부 확인" className={inputClass} />
      </Field>
      <Field label="분류">
        <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-28">
          <option value="revenue">매출</option>
          <option value="cost">비용</option>
          <option value="contract">계약</option>
          <option value="operation">운영</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending || !title.trim()}>
        추가
      </Button>
    </form>
  );
}

const TERM_FIELDS: Array<{ key: keyof DealTerms; label: string; money?: boolean; date?: boolean }> = [
  { key: "premium", label: "희망 권리금", money: true },
  { key: "deposit", label: "보증금", money: true },
  { key: "monthlyRent", label: "월세", money: true },
  { key: "handoverDate", label: "인수 희망일", date: true },
  { key: "includedAssets", label: "인수 대상 시설·집기" },
  { key: "other", label: "기타 조건" },
];

export function TermsEditor({ dealId, terms, disabled }: { dealId: string; terms: DealTerms; disabled?: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TERM_FIELDS.map((f) => [f.key, terms[f.key] === null || terms[f.key] === undefined ? "" : f.money ? Number(terms[f.key]).toLocaleString("ko-KR") : String(terms[f.key])])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const patch: Record<string, unknown> = {};
    for (const f of TERM_FIELDS) {
      const raw = values[f.key].trim();
      if (f.money) {
        const n = raw === "" ? null : Number(raw.replace(/[,\s원]/g, ""));
        if (n !== null && (!Number.isInteger(n) || n < 0)) return setError(`${f.label}: 0 이상의 원 단위 숫자를 입력하세요`);
        patch[f.key] = n;
      } else patch[f.key] = raw === "" ? null : raw;
    }
    setPending(true);
    setError(null);
    try {
      await api(`/api/deals/${dealId}/terms`, { method: "PATCH", json: patch });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {TERM_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} className={f.money || f.date ? "" : "sm:col-span-3"}>
            <input
              type={f.date ? "date" : "text"}
              inputMode={f.money ? "numeric" : undefined}
              disabled={disabled}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={`${inputClass} ${f.money ? "text-right tabular-nums" : ""}`}
            />
          </Field>
        ))}
      </div>
      {error && <Notice tone="negative">{error}</Notice>}
      {!disabled && (
        <div className="flex justify-end">
          <Button variant="primary" disabled={pending} onClick={save}>
            {pending ? "저장 중…" : "조건 변경 저장"}
          </Button>
        </div>
      )}
      <p className="text-[11px] text-neutral-500">변경하면 이전 값과 함께 이력에 남고, 대화방에 변경 알림이 표시됩니다.</p>
    </div>
  );
}

export function PrivateNote({ dealId, initial, updatedAt }: { dealId: string; initial: string; updatedAt: string | null }) {
  const [body, setBody] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  return (
    <div className="space-y-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={10000} placeholder="협상 전략, 개인 판단 등 상대방에게 보이지 않을 메모" className={`${inputClass} h-auto py-2`} />
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span>나만 볼 수 있습니다 · AI 분석에 사용하지 않습니다{updatedAt && state === "idle" ? " · 저장됨" : ""}</span>
        <Button
          disabled={state === "saving"}
          onClick={async () => {
            setState("saving");
            try {
              await api(`/api/deals/${dealId}/note`, { method: "PUT", json: { body } });
              setState("saved");
            } catch {
              setState("error");
            }
          }}
        >
          {state === "saving" ? "저장 중…" : state === "saved" ? "저장됨" : state === "error" ? "다시 저장" : "메모 저장"}
        </Button>
      </div>
    </div>
  );
}

export function SaveDealReportButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/api/deals/${dealId}/report`, { method: "POST" });
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "저장 중…" : "현재 상태로 보고서 저장"}
    </Button>
  );
}
