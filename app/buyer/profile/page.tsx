"use client";

// 양수인 인수 조건 (PRD 9번 화면 5). 양수인 AI가 추천·질문·비교에 이 조건을 쓴다. 언제든 고칠 수 있다.

import { useEffect, useState } from "react";
import { useUser } from "@/components/RoleSwitch";
import { apiFetch } from "@/lib/api-client";
import type { BuyerProfile } from "@/lib/facts";
import { won } from "@/lib/format";
import { BUSINESS_TYPES } from "@/lib/types";

type Form = { budget: string; regions: string; types: string[]; target: string; hours: string; experience: string; payback: string; notes: string };
const EMPTY: Form = { budget: "", regions: "", types: [], target: "", hours: "", experience: "", payback: "", notes: "" };
const INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2 tabular-nums";

export default function BuyerProfilePage() {
  const user = useUser();
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: BuyerProfile | null }>("/api/buyer/profile")
      .then(({ profile: p }) =>
        setForm(
          p
            ? {
                budget: p.budget_total ? String(p.budget_total / 10_000) : "",
                regions: p.regions.join(", "),
                types: p.business_types,
                target: p.target_monthly_profit ? String(p.target_monthly_profit / 10_000) : "",
                hours: p.weekly_hours?.toString() ?? "",
                experience: p.experience ?? "",
                payback: p.payback_months?.toString() ?? "",
                notes: p.notes ?? "",
              }
            : EMPTY,
        ),
      )
      .catch((e: Error) => setError(e.message));
  }, [user.id]);

  if (user.role !== "buyer") {
    return <p className="mx-auto max-w-2xl rounded-xl bg-card p-6 text-center text-sm text-muted">인수 조건은 양수인 모드에서 넣어요. 위에서 &quot;양수인&quot;을 눌러 주세요.</p>;
  }
  if (!form) return <p className="text-sm text-muted">{error ?? "불러오는 중..."}</p>;

  const set = (k: keyof Form, numeric = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: numeric ? e.target.value.replace(/[^0-9]/g, "") : e.target.value });
  const man = (v: string) => (v ? won(Number(v) * 10_000) : "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await apiFetch("/api/buyer/profile", {
        method: "PUT",
        body: JSON.stringify({
          budget_total: form!.budget ? Number(form!.budget) * 10_000 : null,
          regions: form!.regions.split(",").map((s) => s.trim()),
          business_types: form!.types,
          target_monthly_profit: form!.target ? Number(form!.target) * 10_000 : null,
          weekly_hours: form!.hours,
          experience: form!.experience,
          payback_months: form!.payback,
          notes: form!.notes,
        }),
      });
      setMsg("저장했어요. 추천과 AI 실사에 바로 반영돼요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">내 조건</h1>
        <p className="mt-1 text-sm text-muted">알려주신 조건으로 맞는 매물을 추천하고, 매물마다 꼭 필요한 것만 물어봐요.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="투자 가능 총예산 (만원)" hint="권리금, 보증금, 추가로 들 돈을 모두 더한 금액이에요">
          <input value={form.budget} onChange={set("budget", true)} inputMode="numeric" placeholder="15000" className={INPUT} />
          <Hint>{man(form.budget)}</Hint>
        </Field>
        <Field label="목표 월 순수익 (만원)">
          <input value={form.target} onChange={set("target", true)} inputMode="numeric" placeholder="500" className={INPUT} />
          <Hint>{man(form.target)}</Hint>
        </Field>
        <Field label="희망 지역 (쉼표로 구분)">
          <input value={form.regions} onChange={set("regions")} placeholder="서울, 마포구" className={INPUT} />
        </Field>
        <Field label="일주일에 직접 일할 수 있는 시간">
          <input value={form.hours} onChange={set("hours", true)} inputMode="numeric" placeholder="40" className={INPUT} />
        </Field>
        <Field label="몇 개월 안에 돌려받고 싶나요?">
          <input value={form.payback} onChange={set("payback", true)} inputMode="numeric" placeholder="24" className={INPUT} />
        </Field>
        <Field label="비슷한 일을 해 본 경험">
          <input value={form.experience} onChange={set("experience")} maxLength={300} placeholder="외식업 아르바이트 2년" className={INPUT} />
        </Field>
        <Field label="관심 있는 업종" full>
          <div className="flex flex-wrap gap-2">
            {BUSINESS_TYPES.map((t) => {
              const on = form.types.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, types: on ? form.types.filter((x) => x !== t) : [...form.types, t] })}
                  className={"rounded-full px-3 py-1 text-sm " + (on ? "bg-accent text-white" : "bg-bg text-muted hover:text-text")}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="그 밖에 원하는 점" full>
          <textarea value={form.notes} onChange={set("notes")} maxLength={500} rows={2} placeholder="직원 2명 이하로 운영하고 싶어요" className={INPUT} />
        </Field>
      </div>

      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      {msg && <p className="rounded-lg bg-accent/10 p-3 text-sm text-accent">{msg}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-lg bg-accent py-3 font-medium text-white disabled:opacity-60">
        {saving ? "저장하는 중..." : "저장하기"}
      </button>
    </form>
  );
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={"block " + (full ? "sm:col-span-2" : "")}>
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return children ? <span className="mt-1 block text-xs text-muted">{children}</span> : null;
}
