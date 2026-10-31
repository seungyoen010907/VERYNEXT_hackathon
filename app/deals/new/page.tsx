"use client";

// 거래방 만들기 폼. 입력 검증 규칙은 docs/API.md POST /api/deals 1번.
// Step 1은 API가 없어서 검증만 하고 예시 거래방(/deals/test)으로 이동한다.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { won } from "@/lib/format";
import type { BusinessType } from "@/lib/types";

const MAX_AMOUNT = 10_000_000_000; // 100억

const AMOUNT_FIELDS = [
  { name: "premium", label: "권리금", placeholder: "60000000", required: true },
  { name: "deposit", label: "보증금", placeholder: "30000000", required: true },
  { name: "monthly_rent", label: "월세", placeholder: "2500000", required: true },
  { name: "claimed_monthly_sales", label: "양도인이 말한 월매출", placeholder: "35000000", required: true },
  { name: "claimed_monthly_profit", label: "양도인이 말한 월 순수익 (선택)", placeholder: "8000000", required: false },
] as const;

type AmountName = (typeof AMOUNT_FIELDS)[number]["name"];

export default function NewDealPage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("음식점");
  const [amounts, setAmounts] = useState<Record<AmountName, string>>({
    premium: "",
    deposit: "",
    monthly_rent: "",
    claimed_monthly_sales: "",
    claimed_monthly_profit: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    const a = address.trim();
    if (a.length < 1 || a.length > 200) return "점포 주소를 1~200자로 입력해주세요.";
    for (const f of AMOUNT_FIELDS) {
      const raw = amounts[f.name].trim();
      if (!raw && !f.required) continue;
      const n = Number(raw);
      if (!raw || !Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) {
        return `${f.label}을(를) 0~100억 사이의 숫자(원)로 입력해주세요.`;
      }
    }
    return null;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const message = validate();
    setError(message);
    if (message) return;
    setLoading(true);
    // Step 3에서 POST /api/deals 호출로 바꾼다
    router.push("/deals/test");
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">거래방 만들기</h1>
        <p className="mt-1 text-sm text-muted">점포 정보와 양도인이 말한 매출을 입력하면 거래방이 만들어져요.</p>
      </div>

      <label className="block">
        <span className="text-sm font-medium">점포 주소</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={200}
          placeholder="서울 마포구 ○○로 12, 1층"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">업종</span>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
        >
          <option>음식점</option>
          <option>카페</option>
          <option>기타</option>
        </select>
      </label>

      {AMOUNT_FIELDS.map((f) => {
        const value = amounts[f.name];
        const n = Number(value);
        return (
          <label key={f.name} className="block">
            <span className="text-sm font-medium">{f.label}</span>
            <input
              value={value}
              onChange={(e) => setAmounts({ ...amounts, [f.name]: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
              placeholder={f.placeholder}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 tabular-nums"
            />
            {value && Number.isFinite(n) && <span className="mt-1 block text-xs text-muted">{won(n)}</span>}
          </label>
        );
      })}

      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent py-3 font-medium text-white disabled:opacity-60"
      >
        {loading ? "만드는 중..." : "거래방 만들기"}
      </button>
    </form>
  );
}
