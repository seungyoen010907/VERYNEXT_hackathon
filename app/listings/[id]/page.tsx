import { Suspense } from "react";
import DataRoomView from "@/components/DataRoomView";

// params는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function ListingPage({ params }: PageProps<"/listings/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <DataRoomLoader params={params} />
    </Suspense>
  );
}

async function DataRoomLoader({ params }: { params: PageProps<"/listings/[id]">["params"] }) {
  const { id } = await params;
  return <DataRoomView id={id} />;
}
