import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-sm border border-neutral-200 bg-white p-6">
      <p className="text-[13px] font-semibold">요청한 항목을 찾을 수 없습니다.</p>
      <p className="mt-1 text-[12px] text-neutral-600">삭제되었거나 볼 권한이 없는 매물일 수 있습니다.</p>
      <Link href="/stores" className="mt-4 inline-block text-[13px] underline">
        매물 목록으로
      </Link>
    </div>
  );
}
