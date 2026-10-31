"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-sm border border-red-200 bg-white p-6">
      <p className="text-[13px] font-semibold text-red-800">화면을 불러오지 못했습니다.</p>
      <p className="mt-1 text-[12px] text-neutral-600">{error.message}</p>
      <button type="button" onClick={reset} className="mt-4 h-8 rounded-sm border border-neutral-300 px-3 text-[13px] hover:bg-neutral-50">
        다시 시도
      </button>
    </div>
  );
}
