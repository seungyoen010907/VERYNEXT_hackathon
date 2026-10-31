import { Suspense } from "react";
import CompareView from "@/components/CompareView";

// searchParams(ids)는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <CompareLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function CompareLoader({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const sp = await searchParams;
  const ids = String(sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  return <CompareView idsParam={ids} />;
}
