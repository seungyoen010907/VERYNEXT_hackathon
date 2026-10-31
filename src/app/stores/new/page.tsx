import { StoreForm } from "@/components/client/store-form";
import { Notice } from "@/components/ui";
import { requestContext } from "@/server/http";

export default async function NewStorePage() {
  const { viewer } = await requestContext();
  if (viewer.role === "buyer") {
    return <Notice tone="caution">매물 등록은 양도인 계정으로만 할 수 있습니다. 상단 사용자 메뉴에서 양도인 계정으로 전환하세요.</Notice>;
  }
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-neutral-600">점포 정보를 등록한 뒤 증빙 자료를 업로드하면 실사 분석을 실행할 수 있습니다.</p>
      <StoreForm />
    </div>
  );
}
