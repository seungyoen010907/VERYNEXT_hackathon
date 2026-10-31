import { Suspense } from "react";
import DiligenceView from "@/components/DiligenceView";

// searchParams(ids, task)는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function DiligencePage({ searchParams }: PageProps<"/diligence">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <DiligenceLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function DiligenceLoader({ searchParams }: { searchParams: PageProps<"/diligence">["searchParams"] }) {
  const sp = await searchParams;
  const ids = String(sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const task = typeof sp.task === "string" ? sp.task : null;
  return <DiligenceView ids={ids} taskParam={task} />;
}
