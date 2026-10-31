"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListingThumb } from "../listing-thumb";
import { Notice, Panel } from "../ui";
import { api } from "./api";

export function CoverUpload({ storeId, hasImage, industry }: { storeId: string; hasImage: boolean; industry: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <Panel title="대표 이미지" description="JPG·PNG, 5MB 이하. 매물 둘러보기 목록과 상세에 표시됩니다." className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-4">
        <div key={version}>
          <ListingThumb storeId={storeId} hasImage={hasImage || version > 0} industry={industry} className="h-24 w-36" />
        </div>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-sm border border-neutral-300 bg-white px-3 text-[13px] hover:bg-neutral-50">
          {pending ? "올리는 중…" : hasImage ? "이미지 변경" : "이미지 등록"}
          <input
            type="file"
            accept=".jpg,.jpeg,.png"
            className="sr-only"
            disabled={pending}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setPending(true);
              setError(null);
              const fd = new FormData();
              fd.set("file", f);
              try {
                await api(`/api/stores/${storeId}/cover`, { method: "POST", body: fd });
                setVersion((v) => v + 1);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "등록하지 못했습니다.");
              } finally {
                setPending(false);
              }
            }}
          />
        </label>
      </div>
      {error && <div className="mt-2"><Notice tone="negative">{error}</Notice></div>}
    </Panel>
  );
}
