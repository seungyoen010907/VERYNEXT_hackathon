/**
 * 거래 자료 요청: AI·사용자가 만든 요청 초안 → 사용자가 확인·수정 → 메신저로 전송
 * AI는 상대방에게 직접 메시지를 보내지 않는다. 전송은 항상 사용자가 한다.
 */
import type { DealMessage, DealTask } from "@/types/domain";
import type { Db } from "../db/client";
import { checklistDefinition } from "../diligence/checklist";
import { pgArray } from "../db/client";
import { camelizeAll } from "../repo/mappers";
import { recordDealEvent } from "./events";
import type { DealContext } from "./repo";
import { changeTaskStatus, templateFor } from "./tasks";

export interface RequestDraftItem {
  taskKey: string;
  title: string;
  reason: string;
  period: string | null;
  relatedFindingKey: string | null;
  target: "seller" | "buyer";
}

export function composeRequestMessage(storeName: string, items: RequestDraftItem[]): string {
  return [
    `${storeName} 실사를 위해 아래 자료를 요청드립니다.`,
    "",
    ...items.map((i, n) => `${n + 1}. ${i.title}${i.period ? ` (${i.period})` : ""}\n   - 사유: ${i.reason}`),
    "",
    "PDF·엑셀·이미지 파일을 이 대화방에 첨부해 주시면 됩니다.",
  ].join("\n");
}

/** 자료 요청 메시지 전송 시: 업무를 '요청 완료'로 바꾸고, 기존 누락 자료 요청 기록(document_requests)에도 남긴다. */
export async function markTasksRequested(db: Db, ctx: DealContext, taskKeys: string[], actorId: string, message: DealMessage): Promise<void> {
  const tasks = camelizeAll<DealTask>(
    await db.query(`select * from deal_tasks where deal_id = $1 and key = any($2::text[])`, [ctx.deal.id, pgArray(taskKeys)]),
  );
  const evidence = [{ kind: "message" as const, id: message.id, seq: message.seq, label: "자료 요청 메시지" }];
  for (const t of tasks) {
    if (t.status === "not_requested" || t.status === "needs_more") {
      await changeTaskStatus(db, t, "requested", { kind: "user", id: actorId }, "메신저로 자료 요청", evidence);
    }
  }
  const valid = new Set(checklistDefinition(ctx.store.industry, true).map((d) => d.key));
  const checklistKeys = [...new Set(taskKeys.map((k) => templateFor(ctx.store.industry, k)?.checklistKey).filter((k): k is string => !!k && valid.has(k)))];
  if (checklistKeys.length > 0) {
    await db.query(`insert into document_requests (store_id, requested_by, checklist_keys, message) values ($1, $2, $3, $4)`, [
      ctx.store.id,
      actorId,
      pgArray(checklistKeys),
      message.body.slice(0, 5000),
    ]);
  }
  await recordDealEvent(db, {
    dealId: ctx.deal.id,
    actorKind: "user",
    actorId,
    type: "request_sent",
    title: `자료 요청: ${tasks.map((t) => t.title).join(", ") || "자료"}`,
    detail: { taskKeys, messageId: message.id },
  });
}
