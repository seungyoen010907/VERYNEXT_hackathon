import { Suspense } from "react";
import DealRoom from "@/components/DealRoom";

// params는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <DealRoomLoader params={params} />
    </Suspense>
  );
}

async function DealRoomLoader({ params }: { params: PageProps<"/deals/[id]">["params"] }) {
  const { id } = await params;
  return <DealRoom id={id} />;
}
