import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, readJson } from "@/server/http";
import { setAutoRun } from "@/server/deals/repo";

const schema = z.object({ aiAutoRun: z.boolean() });

/** AI 분석 자동 실행 설정 (기본: 꺼짐, 사용자가 확인 후 실행) */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/deals/[id]/settings">) {
  return handle(request, async ({ db, viewer }) => {
    const { id } = await ctx.params;
    const { aiAutoRun } = await readJson(request, schema);
    await setAutoRun(db, viewer, id, aiAutoRun);
    return ok({ aiAutoRun });
  });
}
