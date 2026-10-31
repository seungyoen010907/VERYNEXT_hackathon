import type { NextRequest } from "next/server";
import { handle, ok } from "@/server/http";
import { listDocuments } from "@/server/repo/documents";
import { getEditableStore } from "@/server/repo/stores";

/** 원본 문서 목록은 매물 소유자만 조회할 수 있다. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/documents">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const store = await getEditableStore(db, viewer, id);
    return ok(await listDocuments(db, [store.id]));
  });
}
