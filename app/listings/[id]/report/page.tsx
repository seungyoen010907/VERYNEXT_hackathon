import { Suspense } from "react";
import DiligenceReport from "@/components/DiligenceReport";

// params는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function ListingReportPage({ params }: PageProps<"/listings/[id]/report">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <ReportLoader params={params} />
    </Suspense>
  );
}

async function ReportLoader({ params }: { params: PageProps<"/listings/[id]/report">["params"] }) {
  const { id } = await params;
  return <DiligenceReport id={id} />;
}
