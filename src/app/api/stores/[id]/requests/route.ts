import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { createDocumentRequest, createRequestSchema, listRequests } from "@/server/repo/diligence";
import { getStore } from "@/server/repo/stores";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/requests">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const store = await getStore(db, viewer, id);
    return ok(await listRequests(db, [store.id]));
  });
}

/** 추가 자료 요청을 기록한다. 매물을 볼 수 있는 사용자(양수인 포함)가 요청할 수 있다. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/requests">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const input = await readJson(request, createRequestSchema);
    return ok(await createDocumentRequest(db, viewer, id, input), 201);
  });
}
