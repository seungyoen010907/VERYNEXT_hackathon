import Link from "next/link";
import { Suspense } from "react";
import ReportView from "@/components/ReportView";
import { mockDeal, mockReport } from "@/lib/mock";

// params는 요청이 와야 알 수 있는 값이라 <Suspense>로 감싼다 (cacheComponents 규칙).
export default function ReportPage({ params }: PageProps<"/deals/[id]/report">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">불러오는 중...</p>}>
      <ReportLoader params={params} />
    </Suspense>
  );
}

async function ReportLoader({ params }: { params: PageProps<"/deals/[id]/report">["params"] }) {
  const { id } = await params;
  // Step 1은 가짜 리포트. Step 3에서 GET /api/deals/[id]/report로 바꾼다.
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/deals/${id}`} className="text-sm text-muted hover:text-text">
          ← 거래방으로
        </Link>
        <h1 className="mt-1 text-xl font-bold">검증 리포트</h1>
        <p className="text-sm text-muted">{mockDeal.address}</p>
      </div>
      <ReportView report={mockReport} />
    </div>
  );
}
