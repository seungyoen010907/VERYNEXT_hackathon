import { notFound } from "next/navigation";
import { DeleteStoreButton } from "@/components/client/actions";
import { CoverUpload } from "@/components/client/cover-upload";
import { StoreForm } from "@/components/client/store-form";
import { Notice, Panel } from "@/components/ui";
import { AppError } from "@/server/errors";
import { requestContext } from "@/server/http";
import { getStore } from "@/server/repo/stores";
import { canEdit } from "@/server/viewer";

export default async function EditStorePage({ params }: PageProps<"/stores/[id]/edit">) {
  const [{ id }, { db, viewer }] = await Promise.all([params, requestContext()]);
  const store = await getStore(db, viewer, id).catch((err) => {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  });
  if (!canEdit(viewer, store)) return <Notice tone="caution">매물 소유자만 수정할 수 있습니다.</Notice>;
  return (
    <div className="space-y-4">
      <CoverUpload storeId={store.id} hasImage={!!store.coverImagePath} industry={store.industry} />
      <StoreForm store={store} />
      <Panel title="매물 삭제" actions={<DeleteStoreButton storeId={store.id} name={store.name} />} className="max-w-4xl">
        <p className="text-[12px] text-neutral-600">매물을 삭제하면 증빙 자료, 분석 이력, 보고서, 상담 기록이 모두 삭제됩니다.</p>
      </Panel>
    </div>
  );
}
