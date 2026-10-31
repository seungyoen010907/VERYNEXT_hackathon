import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, readJson } from "@/server/http";
import { getNote, saveNote } from "@/server/deals/repo";

/** 비공개 메모: 작성자 본인만 보며 AI 분석에도 쓰지 않는다 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/note">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    return ok(await getNote(db, viewer, id));
  });
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/note">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const { body } = await readJson(request, z.object({ body: z.string().max(10000) }));
    await saveNote(db, viewer, id, body);
    return ok({ saved: true });
  });
}
