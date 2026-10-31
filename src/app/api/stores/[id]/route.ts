import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { deleteStore, storePatchSchema, updateStore } from "@/server/repo/stores";
import { storeDetail } from "@/server/views";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const d = await storeDetail(db, viewer, id);
    return ok({ store: d.store, canEdit: d.canEdit, summary: d.summary, progress: d.progress });
  });
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/stores/[id]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const patch = await readJson(request, storePatchSchema);
    return ok(await updateStore(db, viewer, id, patch));
  });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/stores/[id]">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    await deleteStore(db, viewer, id);
    return ok({ id });
  });
}
