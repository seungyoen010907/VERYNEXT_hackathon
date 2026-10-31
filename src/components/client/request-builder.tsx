"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Notice, inputClass } from "../ui";
import { api } from "./api";
import { CopyButton } from "./actions";

export interface RequestItem {
  key: string;
  label: string;
  reason: string;
  requestText: string;
}

/** 미제출 자료를 골라 요청 문구를 만들고, 복사하거나 요청 기록을 남긴다. */
export function RequestBuilder({ storeId, storeName, items }: { storeId: string; storeName: string; items: RequestItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.key)));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // 서버의 buildRequestMessage와 같은 형식
  const message = useMemo(() => {
    const chosen = items.filter((i) => selected.has(i.key));
    if (chosen.length === 0) return "";
    return [
      `안녕하세요. ${storeName} 양수 검토를 위해 아래 자료를 추가로 요청드립니다.`,
      "",
      ...chosen.map((i, n) => `${n + 1}. ${i.requestText}\n   - 필요한 이유: ${i.reason}`),
      "",
      "자료는 PDF, 엑셀(XLS/XLSX), 이미지(JPG/PNG) 형식으로 보내주시면 됩니다.",
      "제출해 주신 자료는 매출·수익성 검증 목적으로만 사용합니다. 감사합니다.",
    ].join("\n");
  }, [items, selected, storeName]);

  if (items.length === 0) return <Notice>미제출 자료가 없습니다.</Notice>;

  async function record() {
    setPending(true);
    setResult(null);
    try {
      await api(`/api/stores/${storeId}/requests`, { method: "POST", json: { checklistKeys: [...selected], message } });
      setResult({ ok: true, text: "요청을 기록했습니다. 해당 자료가 모두 제출되면 자동으로 완료 처리됩니다." });
      router.refresh();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "기록하지 못했습니다." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <fieldset>
        <legend className="mb-2 text-[12px] font-medium text-neutral-700">요청할 자료</legend>
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.key}>
              <label className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-neutral-900"
                  checked={selected.has(i.key)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(i.key);
                      else next.delete(i.key);
                      return next;
                    })
                  }
                />
                {i.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="space-y-2">
        <textarea readOnly value={message} rows={10} className={`${inputClass} h-auto py-2 text-[12px] leading-relaxed`} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CopyButton text={message} label="요청 문구 복사" />
          <Button variant="primary" disabled={pending || selected.size === 0} onClick={record}>
            {pending ? "기록 중…" : "요청 기록 남기기"}
          </Button>
        </div>
        {result && <Notice tone={result.ok ? "info" : "negative"}>{result.text}</Notice>}
      </div>
    </div>
  );
}
