import { Suspense } from "react";
import DealRoom from "@/components/DealRoom";

// 거래방 = 매물(id) × 양수인. 양도인은 ?buyer=양수인 id 로 들어온다.
// params·searchParams는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <DealRoomLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DealRoomLoader({ params, searchParams }: Pick<PageProps<"/deals/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { buyer } = await searchParams;
  return <DealRoom id={id} buyer={typeof buyer === "string" ? buyer : null} />;
}
