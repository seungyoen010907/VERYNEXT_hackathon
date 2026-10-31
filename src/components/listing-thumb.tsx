/* eslint-disable @next/next/no-img-element -- 업로드 이미지를 권한 확인 API로 내려주므로 정적 최적화를 쓰지 않는다 */
import { cx } from "./ui";

/** 매물 대표 이미지. 등록된 이미지가 없으면 임의 이미지를 쓰지 않고 '이미지 없음'으로 표시한다. */
export function ListingThumb({ storeId, hasImage, industry, className }: { storeId: string; hasImage: boolean; industry: string; className?: string }) {
  if (hasImage) {
    return <img src={`/api/stores/${storeId}/cover`} alt="매물 대표 이미지" className={cx("rounded-sm border border-neutral-200 object-cover", className)} />;
  }
  return (
    <div className={cx("flex flex-col items-center justify-center rounded-sm border border-dashed border-neutral-300 bg-neutral-50 text-center", className)}>
      <span className="text-[12px] font-medium text-neutral-500">{industry}</span>
      <span className="text-[10px] text-neutral-400">이미지 없음</span>
    </div>
  );
}
