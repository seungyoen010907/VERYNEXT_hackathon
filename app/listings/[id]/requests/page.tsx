import { Suspense } from "react";
import RequestsView from "@/components/RequestsView";

// params는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function RequestsPage({ params }: PageProps<"/listings/[id]/requests">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <RequestsLoader params={params} />
    </Suspense>
  );
}

async function RequestsLoader({ params }: { params: PageProps<"/listings/[id]/requests">["params"] }) {
  const { id } = await params;
  return <RequestsView id={id} />;
}
