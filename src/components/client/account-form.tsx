"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account } from "@/server/repo/account";
import { Button, Field, Input, Notice, Panel } from "../ui";
import { api } from "./api";

const PREFS: Array<{ key: keyof Account["notificationPrefs"]; label: string }> = [
  { key: "messages", label: "읽지 않은 거래 메시지" },
  { key: "ai", label: "AI 분석 가능 · 위험 탐지" },
  { key: "requests", label: "받은 추가 자료 요청" },
];

export function AccountForm({ account }: { account: Account }) {
  const router = useRouter();
  const [name, setName] = useState(account.displayName);
  const [prefs, setPrefs] = useState(account.notificationPrefs);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    setState(null);
    try {
      await api("/api/account", { method: "PATCH", json: { displayName: name, notificationPrefs: prefs } });
      setState({ ok: true, text: "저장했습니다." });
      router.refresh();
    } catch (e) {
      setState({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했습니다." });
    } finally {
      setPending(false);
    }
  }
  return (
    <Panel title="계정 설정 · 알림 설정">
      <div className="space-y-4">
        <Field label="표시 이름" className="max-w-sm">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[12px] font-medium text-neutral-700">상단 알림에 표시할 항목</legend>
          <div className="space-y-1.5">
            {PREFS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" className="size-4 accent-neutral-900" checked={prefs[p.key]} onChange={(e) => setPrefs((v) => ({ ...v, [p.key]: e.target.checked }))} />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-end gap-3">
          {state && <span className={state.ok ? "text-[12px] text-neutral-600" : "text-[12px] text-red-700"}>{state.text}</span>}
          <Button variant="primary" disabled={pending || !name.trim()} onClick={save}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </div>
        {!name.trim() && <Notice tone="caution">이름을 입력하세요.</Notice>}
      </div>
    </Panel>
  );
}
