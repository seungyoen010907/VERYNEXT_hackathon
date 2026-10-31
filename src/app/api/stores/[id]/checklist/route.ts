import type { NextRequest } from "next/server";
import { buildRequestMessage } from "@/server/diligence/checklist";
import { handle, ok } from "@/server/http";
import { getChecklist } from "@/server/repo/diligence";
import { getStore } from "@/server/repo/stores";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/stores/[id]/checklist">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const store = await getStore(db, viewer, id);
    const checklist = await getChecklist(db, store);
    return ok({ ...checklist, requestMessage: checklist.missing.length ? buildRequestMessage(store.name, checklist.missing) : null });
  });
}
