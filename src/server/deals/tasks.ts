/**
 * 거래 실사 체크리스트
 *
 * 거래를 시작하면 업종에 맞는 업무 목록을 만든다. 상태 변경은 모두 deal_task_events에 남긴다.
 *  - system: 증빙자료 업로드·문서 분석 결과에 따라 제출 완료 → 검토 중으로 바꾼다 (근거: 문서)
 *  - ai: 분석 결과에 따라 완료/추가 자료 필요로 바꾼다 (근거: 분석 결과·메시지)
 *  - user: 사용자가 직접 바꾼다
 * 자료가 올라왔다는 사실만으로 완료 처리하지 않는다. 사용자가 완료로 정한 업무는 AI가 되돌리지 않는다.
 */
import { z } from "zod";
import {
  DEAL_TASK_STATUS_LABELS,
  DEAL_TASK_STATUSES,
  type ActorKind,
  type DealEvidence,
  type DealTask,
  type DealTaskEvent,
  type DealTaskGroup,
  type DealTaskStatus,
  type DocumentType,
  type ExpenseCategory,
  type NormalizedPayload,
  type PartyRole,
} from "@/types/domain";
import { isDeliveryIndustry } from "../diligence/checklist";
import type { Db } from "../db/client";
import { badRequest, notFound } from "../errors";
import { camelize, camelizeAll } from "../repo/mappers";
import { recordDealEvent } from "./events";

export interface TaskTemplate {
  key: string;
  group: DealTaskGroup;
  title: string;
  assignee: PartyRole;
  target: PartyRole | null;
  reason: string;
  documentType?: DocumentType;
  expenseCategories?: ExpenseCategory[];
  /** 기존 누락 자료 체크리스트(document_requests)의 항목 키 */
  checklistKey?: string;
  /** 자료 요청 문구에 쓰는 기간 */
  period?: string;
}

export function taskTemplates(industry: string, hasDelivery: boolean): TaskTemplate[] {
  const delivery = hasDelivery || isDeliveryIndustry(industry);
  const t: TaskTemplate[] = [
    { key: "pos_sales", group: "revenue", title: "POS 매출 자료 (최근 12개월, 최소 6개월)", assignee: "buyer", target: "seller", documentType: "pos_sales", checklistKey: "pos_sales", period: "최근 12개월", reason: "실제 총매출 확인의 기본 자료" },
    { key: "card_sales", group: "revenue", title: "카드 매출 내역", assignee: "buyer", target: "seller", documentType: "card_sales", checklistKey: "card_sales", period: "POS와 같은 기간", reason: "POS 매출을 카드사 자료로 교차 확인" },
    { key: "cash_receipts", group: "revenue", title: "현금영수증 발행 내역", assignee: "buyer", target: "seller", period: "POS와 같은 기간", reason: "현금 매출은 카드사 자료로 확인할 수 없음" },
  ];
  if (delivery) {
    t.push({ key: "delivery_sales", group: "revenue", title: "배달앱 매출 및 정산 내역", assignee: "buyer", target: "seller", documentType: "delivery_sales", checklistKey: "delivery_sales", period: "POS와 같은 기간", reason: "배달 매출과 수수료 확인" });
  }
  t.push(
    { key: "expense_material", group: "cost", title: "재료비", assignee: "buyer", target: "seller", documentType: "expense", expenseCategories: ["material"], checklistKey: "expense_material", period: "POS와 같은 기간", reason: "가장 큰 변동비" },
    { key: "expense_labor", group: "cost", title: "인건비", assignee: "buyer", target: "seller", documentType: "expense", expenseCategories: ["labor"], checklistKey: "expense_labor", period: "POS와 같은 기간", reason: "빠지면 순수익이 부풀려짐" },
    { key: "expense_rent_maintenance", group: "cost", title: "임대료 및 관리비", assignee: "buyer", target: "seller", documentType: "expense", expenseCategories: ["rent", "maintenance"], period: "최근 6개월", reason: "고정비 확인" },
    { key: "expense_utilities", group: "cost", title: "공과금 (전기·가스·수도)", assignee: "buyer", target: "seller", documentType: "expense", expenseCategories: ["utilities"], checklistKey: "expense_overhead", period: "최근 6개월", reason: "고정비 확인" },
  );
  if (delivery) {
    t.push({ key: "expense_delivery_fee", group: "cost", title: "배달 수수료", assignee: "buyer", target: "seller", expenseCategories: ["delivery_fee"], period: "POS와 같은 기간", reason: "배달 정산 자료로 확인" });
  }
  t.push(
    { key: "expense_other", group: "cost", title: "광고비 및 기타 비용", assignee: "buyer", target: "seller", documentType: "expense", expenseCategories: ["advertising", "other"], checklistKey: "expense_other", period: "최근 6개월", reason: "없으면 영업이익이 상한값" },
    { key: "lease_contract", group: "contract", title: "임대차 계약서", assignee: "buyer", target: "seller", documentType: "lease_contract", checklistKey: "lease_contract", reason: "월세·보증금·계약 기간·특약 확인" },
    { key: "landlord_consent", group: "contract", title: "임대인 양도 동의 여부", assignee: "buyer", target: "seller", reason: "임대인 동의 없이는 양도가 막힐 수 있음" },
    { key: "lease_renewal", group: "contract", title: "계약 기간 및 갱신 조건", assignee: "buyer", target: "seller", reason: "잔여 기간이 짧으면 투자금 회수 전 계약 종료 위험" },
    { key: "asset_scope", group: "contract", title: "시설 및 집기 인수 범위", assignee: "buyer", target: "seller", reason: "권리금에 포함되는 시설 범위 확정" },
    { key: "premium_contract", group: "contract", title: "권리금 계약 조건", assignee: "buyer", target: null, reason: "지급 시기·반환 조건 확정" },
    { key: "staff_terms", group: "operation", title: "직원 및 고용 조건", assignee: "buyer", target: "seller", reason: "고용 승계 여부와 인건비 변화" },
    { key: "permits", group: "operation", title: "영업 관련 인허가", assignee: "buyer", target: "seller", reason: "영업신고·위생 관련 승계 가능 여부" },
    { key: "suppliers", group: "operation", title: "주요 거래처", assignee: "buyer", target: "seller", reason: "거래 조건 승계 여부" },
  );
  return t;
}

export async function createTasksForDeal(db: Db, dealId: string, industry: string, hasDelivery: boolean): Promise<void> {
  const templates = taskTemplates(industry, hasDelivery);
  for (const [i, t] of templates.entries()) {
    await db.query(
      `insert into deal_tasks (deal_id, key, task_group, title, assignee_role, request_target_role, reason, source, document_type, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,'template',$8,$9) on conflict (deal_id, key) do nothing`,
      [dealId, t.key, t.group, t.title, t.assignee, t.target, t.reason, t.documentType ?? null, i],
    );
  }
}

export async function listTasks(db: Db, dealId: string): Promise<DealTask[]> {
  return camelizeAll<DealTask>(await db.query(`select * from deal_tasks where deal_id = $1 order by sort_order, created_at`, [dealId]));
}

export async function listTaskEvents(db: Db, dealId: string): Promise<Array<DealTaskEvent & { actorName: string | null }>> {
  return camelizeAll(
    await db.query(
      `select e.*, u.display_name as actor_name from deal_task_events e left join users u on u.id = e.actor_id
        where e.deal_id = $1 order by e.created_at desc`,
      [dealId],
    ),
  );
}

/** 상태를 바꾸고 이력을 남긴다. 상태가 같으면 아무것도 하지 않는다. */
export async function changeTaskStatus(
  db: Db,
  task: DealTask,
  to: DealTaskStatus,
  actor: { kind: ActorKind; id: string | null },
  note: string,
  evidence: DealEvidence[],
): Promise<boolean> {
  if (task.status === to) return false;
  if (actor.kind !== "user") {
    if (evidence.length === 0) throw new Error("AI·시스템 상태 변경에는 근거가 필요합니다");
    // 사용자가 완료로 정한 업무는 자동으로 되돌리지 않는다
    const last = await db.query<{ actor_kind: string; to_status: string }>(
      `select actor_kind, to_status from deal_task_events where task_id = $1 order by created_at desc limit 1`,
      [task.id],
    );
    if (last[0]?.actor_kind === "user" && last[0].to_status === "done") return false;
  }
  await db.query(
    `update deal_tasks set status = $2, evidence = (
        select coalesce(jsonb_agg(distinct e), '[]'::jsonb) from jsonb_array_elements(evidence || $3::jsonb) e
      ) where id = $1`,
    [task.id, to, JSON.stringify(evidence)],
  );
  await db.query(
    `insert into deal_task_events (task_id, deal_id, actor_kind, actor_id, from_status, to_status, note, evidence)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [task.id, task.dealId, actor.kind, actor.id, task.status, to, note, JSON.stringify(evidence)],
  );
  await recordDealEvent(db, {
    dealId: task.dealId,
    actorKind: actor.kind,
    actorId: actor.id,
    type: "task_status_changed",
    title: `${task.title}: ${DEAL_TASK_STATUS_LABELS[task.status]} → ${DEAL_TASK_STATUS_LABELS[to]}`,
    detail: { taskId: task.id, from: task.status, to, note },
  });
  task.status = to;
  return true;
}

const ORDER: Record<DealTaskStatus, number> = { not_requested: 0, requested: 1, submitted: 2, reviewing: 3, needs_more: 3, done: 4 };

/**
 * 증빙자료 상태로 업무를 갱신한다 (system). 업로드 → 제출 완료, 분석 완료 → 검토 중.
 * 이미 더 진행된 업무는 건드리지 않는다.
 */
export async function syncTasksFromDocuments(
  db: Db,
  dealId: string,
  industry: string,
  documents: Array<{ id: string; documentType: DocumentType; status: string; fileName: string }>,
  payloads: Array<{ documentId: string | null; payload: NormalizedPayload }>,
): Promise<number> {
  const tasks = await listTasks(db, dealId);
  const templates = new Map(taskTemplates(industry, true).map((t) => [t.key, t]));
  let changed = 0;
  for (const task of tasks) {
    const t = templates.get(task.key);
    if (!t?.documentType) continue;
    const docs = documents.filter((d) => d.documentType === t.documentType && d.status !== "failed");
    if (docs.length === 0) continue;
    const ev = docs.map((d) => ({ kind: "document" as const, id: d.id, label: d.fileName }));
    let analyzedHasData = false;
    if (t.expenseCategories) {
      const cats = new Set(payloads.flatMap((p) => p.payload.expenses.map((e) => e.category)));
      analyzedHasData = t.expenseCategories.some((c) => cats.has(c));
      const anyExpenseDoc = docs.length > 0;
      if (!anyExpenseDoc) continue;
      // 비용 자료가 올라왔지만 이 항목이 없으면 상태를 바꾸지 않는다
      if (!analyzedHasData && docs.every((d) => d.status === "analyzed")) continue;
    } else {
      analyzedHasData = docs.some((d) => d.status === "analyzed");
    }
    const target: DealTaskStatus = analyzedHasData ? "reviewing" : "submitted";
    if (ORDER[task.status] >= ORDER[target]) continue;
    if (await changeTaskStatus(db, task, target, { kind: "system", id: null }, analyzedHasData ? "문서 분석 완료: 내용 검토 필요" : "자료 제출됨", ev)) changed++;
  }
  return changed;
}

export const taskPatchSchema = z.object({
  status: z.enum(DEAL_TASK_STATUSES).optional(),
  dueDate: z.iso.date().nullable().optional(),
  assigneeRole: z.enum(["seller", "buyer"]).optional(),
  note: z.string().max(500).default(""),
});

export async function updateTaskByUser(
  db: Db,
  dealId: string,
  taskId: string,
  actorId: string,
  patch: z.infer<typeof taskPatchSchema>,
): Promise<DealTask> {
  const rows = await db.query(`select * from deal_tasks where id = $1 and deal_id = $2`, [taskId, dealId]);
  if (rows.length === 0) throw notFound("업무");
  const task = camelize<DealTask>(rows[0]);
  if (patch.dueDate !== undefined) await db.query(`update deal_tasks set due_date = $2 where id = $1`, [taskId, patch.dueDate]);
  if (patch.assigneeRole) await db.query(`update deal_tasks set assignee_role = $2 where id = $1`, [taskId, patch.assigneeRole]);
  if (patch.status) await changeTaskStatus(db, task, patch.status, { kind: "user", id: actorId }, patch.note, []);
  return camelize<DealTask>((await db.query(`select * from deal_tasks where id = $1`, [taskId]))[0]);
}

export const newTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  taskGroup: z.enum(["revenue", "cost", "contract", "operation"]),
  assigneeRole: z.enum(["seller", "buyer"]),
  requestTargetRole: z.enum(["seller", "buyer"]).nullable().default(null),
  dueDate: z.iso.date().nullable().default(null),
  reason: z.string().max(500).default(""),
});

export async function addTask(
  db: Db,
  dealId: string,
  input: z.infer<typeof newTaskSchema>,
  source: "user" | "ai",
  key?: string,
): Promise<DealTask | null> {
  const k = key ?? `custom_${Date.now().toString(36)}`;
  const rows = await db.query(
    `insert into deal_tasks (deal_id, key, task_group, title, assignee_role, request_target_role, due_date, reason, source, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, 1000) on conflict (deal_id, key) do nothing returning *`,
    [dealId, k, input.taskGroup, input.title, input.assigneeRole, input.requestTargetRole, input.dueDate, input.reason, source],
  );
  if (rows.length === 0 && !key) throw badRequest("업무를 추가하지 못했습니다.");
  return rows[0] ? camelize<DealTask>(rows[0]) : null;
}

export function templateFor(industry: string, key: string): TaskTemplate | undefined {
  return taskTemplates(industry, true).find((t) => t.key === key);
}
