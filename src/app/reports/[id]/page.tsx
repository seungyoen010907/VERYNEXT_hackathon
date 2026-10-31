import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/analysis/report-view";
import { PrintButton } from "@/components/client/actions";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";
import { previewReport, type ReportContent } from "@/server/repo/reports";

/** 인쇄용 보고서. 브라우저 인쇄 기능으로 PDF를 저장한다 (외부 서비스 없음). */
export default async function PrintReportPage({ params }: PageProps<"/reports/[id]">) {
  const [{ id }, { db, viewer }] = await Promise.all([params, requestContext()]);
  let result: { content: ReportContent; saved: unknown };
  try {
    result = await previewReport(db, viewer, id);
  } catch (err) {
    if (err instanceof AppError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <div className="no-print flex items-center justify-between">
        <Link href={`/stores/${result.content.store.id}?tab=report`} className="text-[12px] underline">매물로 돌아가기</Link>
        <PrintButton />
      </div>
      <div className="rounded-sm border border-neutral-200 bg-white p-8 print:border-0 print:p-0">
        <ReportView content={result.content} saved={!!result.saved} />
      </div>
    </div>
  );
}
