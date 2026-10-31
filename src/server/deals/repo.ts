/**
 * 거래(딜) 저장소: 거래 시작, 접근 권한, 메시지, 읽음, 조건 변경, 단계 변경, 비공개 메모, 타임라인
 * 거래 데이터는 거래 당사자(양도인·양수인)만 접근한다.
 */
import { z } from "zod";
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  DEAL_TERM_LABELS,
  DOCUMENT_TYPE_LABELS,
  type Deal,
  type DealEvent,
  type DealMessage,
  type DealStage,
  type DealTerms,
  type DocumentType,
  type PartyRole,
  type Store,
} from "@/types/domain";
import { pgArray, type Db } from "../db/client";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { analyzeDocument } from "../ingest/service";
import { fulfillRequests } from "../repo/diligence";
import { saveDocument } from "../repo/documents";
import { camelize, camelizeAll } from "../repo/mappers";
import { getStore } from "../repo/stores";
import type { Viewer } from "../viewer";
import { recordDealEvent } from "./events";
import { createTasksForDeal } from "./tasks";

export const AI_NOTICE =
  "이 거래 대화방의 메시지와 공유된 자료는 AI 거래 분석(매출·비용·계약 대조, 위험 확인)에 사용됩니다. 비공개 메모는 상대방에게 보이지 않고 분석에도 사용하지 않습니다. AI는 사기 여부를 확정하거나 법률적 안전성을 보장하지 않습니다.";

export interface DealContext {
  deal: Deal;
  store: Store;
  role: PartyRole;
  counterpartId: string;
}

function termsFromStore(store: Store): DealTerms {
  return {
    premium: store.premium,
    deposit: store.deposit,
    monthlyRent: store.monthlyRent,
    handoverDate: null,
    includedAssets: store.facilityDescription || null,
    other: store.dealConditions || null,
  };
}

/** 거래 당사자가 아니면 거래의 존재를 드러내지 않도록 404를 낸다. */
export async function getDealContext(db: Db, viewer: Viewer, dealId: string): Promise<DealContext> {
  if (!z.uuid().safeParse(dealId).success) throw notFound("거래");
  const rows = await db.query(`select * from deals where id = $1`, [dealId]);
  if (rows.length === 0) throw notFound("거래");
  const deal = camelize<Deal>(rows[0]);
  if (deal.sellerId !== viewer.id && deal.buyerId !== viewer.id) throw notFound("거래");
  const store = await getStore(db, viewer, deal.storeId);
  const role: PartyRole = deal.sellerId === viewer.id ? "seller" : "buyer";
  return { deal, store, role, counterpartId: role === "seller" ? deal.buyerId : deal.sellerId };
}

export const startDealSchema = z.object({
  storeId: z.uuid(),
  message: z.string().trim().max(2000).optional(),
});

/** 거래 문의 시작. 같은 매물에 이미 문의한 거래가 있으면 그 거래를 돌려준다 (중복 생성 방지). */
export async function startDeal(db: Db, viewer: Viewer, input: z.infer<typeof startDealSchema>): Promise<{ deal: Deal; created: boolean }> {
  const store = await getStore(db, viewer, input.storeId);
  if (store.ownerId === viewer.id) throw badRequest("본인 매물에는 거래 문의를 할 수 없습니다.");
  const existing = await db.query(`select * from deals where store_id = $1 and buyer_id = $2`, [store.id, viewer.id]);
  if (existing.length > 0) return { deal: camelize<Deal>(existing[0]), created: false };
  if (!store.isPublished) throw notFound("매물");
  if (store.listingStatus === "closed") throw badRequest("거래가 완료된 매물입니다.");

  const deal = await db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into deals (store_id, seller_id, buyer_id, terms) values ($1, $2, $3, $4)
       on conflict (store_id, buyer_id) do nothing returning *`,
      [store.id, store.ownerId, viewer.id, JSON.stringify(termsFromStore(store))],
    );
    if (rows.length === 0) return camelize<Deal>((await tx.query(`select * from deals where store_id = $1 and buyer_id = $2`, [store.id, viewer.id]))[0]);
    const d = camelize<Deal>(rows[0]);
    const delivery = await tx.query(`select 1 from monthly_revenues where store_id = $1 and source::text like 'delivery%' limit 1`, [store.id]);
    await createTasksForDeal(tx, d.id, store.industry, delivery.length > 0);
    await tx.query(`insert into deal_messages (deal_id, sender_id, kind, body) values ($1, null, 'system', $2)`, [d.id, AI_NOTICE]);
    await recordDealEvent(tx, { dealId: d.id, actorKind: "user", actorId: viewer.id, type: "deal_started", title: `거래 문의 시작: ${store.name}` });
    return d;
  });
  if (input.message) await sendMessage(db, viewer, deal.id, { body: input.message, kind: "text" });
  return { deal, created: true };
}

export interface DealListItem {
  deal: Deal;
  store: Pick<Store, "id" | "name" | "industry" | "region" | "premium" | "deposit" | "monthlyRent" | "isTestData" | "listingStatus">;
  role: PartyRole;
  counterpartName: string;
  lastMessage: { body: string; kind: string; createdAt: string; senderId: string | null } | null;
  unread: number;
  /** 마지막 AI 분석 이후 새 메시지 수 */
  messagesSinceAnalysis: number;
  openFindings: { total: number; serious: number };
  openTasks: number;
}

export type DealFilter = "all" | "buying" | "selling" | "active" | "closed";

export async function listDeals(db: Db, viewer: Viewer, filter: DealFilter = "all", storeId?: string): Promise<DealListItem[]> {
  const where = ["(d.seller_id = $1 or d.buyer_id = $1)"];
  if (filter === "buying") where.push("d.buyer_id = $1");
  if (filter === "selling") where.push("d.seller_id = $1");
  if (filter === "active") where.push("d.stage not in ('completed', 'cancelled')");
  if (filter === "closed") where.push("d.stage in ('completed', 'cancelled')");
  const params: unknown[] = [viewer.id];
  if (storeId) {
    params.push(storeId);
    where.push(`d.store_id = $${params.length}`);
  }
  const rows = await db.query<Record<string, unknown>>(
    `select d.*,
            s.name as s_name, s.industry as s_industry, s.region as s_region, s.premium as s_premium, s.deposit as s_deposit,
            s.monthly_rent as s_monthly_rent, s.is_test_data as s_is_test_data, s.listing_status as s_listing_status,
            cp.display_name as counterpart_name,
            lm.body as lm_body, lm.kind as lm_kind, lm.created_at as lm_created_at, lm.sender_id as lm_sender_id,
            (select count(*)::int from deal_messages m where m.deal_id = d.id and m.kind <> 'system'
               and m.seq > coalesce((select last_read_seq from deal_reads r where r.deal_id = d.id and r.user_id = $1), 0)
               and m.sender_id is distinct from $1) as unread,
            (select count(*)::int from deal_messages m where m.deal_id = d.id and m.kind <> 'system'
               and m.seq > coalesce((select max(to_seq) from deal_ai_runs a where a.deal_id = d.id), 0)) as since_analysis,
            (select count(*)::int from deal_ai_findings f where f.deal_id = d.id and f.status = 'open') as open_findings,
            (select count(*)::int from deal_ai_findings f where f.deal_id = d.id and f.status = 'open' and f.level in ('HIGH','CRITICAL')) as serious_findings,
            (select count(*)::int from deal_tasks t where t.deal_id = d.id and t.status <> 'done') as open_tasks
       from deals d
       join stores s on s.id = d.store_id
       join users cp on cp.id = case when d.seller_id = $1 then d.buyer_id else d.seller_id end
       left join lateral (select body, kind, created_at, sender_id from deal_messages m where m.deal_id = d.id order by seq desc limit 1) lm on true
      where ${where.join(" and ")}
      order by coalesce(d.last_message_at, d.created_at) desc`,
    params,
  );
  return rows.map((r) => {
    const deal = camelize<Deal & Record<string, unknown>>(r);
    return {
      deal: {
        id: deal.id,
        storeId: deal.storeId,
        sellerId: deal.sellerId,
        buyerId: deal.buyerId,
        stage: deal.stage,
        terms: deal.terms,
        aiAutoRun: deal.aiAutoRun,
        lastMessageAt: deal.lastMessageAt,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      },
      store: {
        id: deal.storeId,
        name: r.s_name as string,
        industry: r.s_industry as string,
        region: r.s_region as string,
        premium: r.s_premium as number,
        deposit: r.s_deposit as number,
        monthlyRent: r.s_monthly_rent as number,
        isTestData: r.s_is_test_data as boolean,
        listingStatus: r.s_listing_status as Store["listingStatus"],
      },
      role: deal.sellerId === viewer.id ? "seller" : "buyer",
      counterpartName: r.counterpart_name as string,
      lastMessage: r.lm_created_at
        ? { body: r.lm_body as string, kind: r.lm_kind as string, createdAt: r.lm_created_at as string, senderId: (r.lm_sender_id as string) ?? null }
        : null,
      unread: r.unread as number,
      messagesSinceAnalysis: r.since_analysis as number,
      openFindings: { total: r.open_findings as number, serious: r.serious_findings as number },
      openTasks: r.open_tasks as number,
    };
  });
}

// -----------------------------------------------------------------------------
// 메시지
// -----------------------------------------------------------------------------
export interface MessageRow extends DealMessage {
  senderName: string | null;
  senderRole: PartyRole | null;
  document: { id: string; fileName: string; documentType: DocumentType; status: string; fileSize: number; mimeType: string } | null;
}

export async function listMessages(db: Db, ctx: DealContext, opts: { afterSeq?: number; limit?: number } = {}): Promise<MessageRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select m.*, u.display_name as sender_name,
            d.file_name as doc_file_name, d.document_type as doc_type, d.status as doc_status, d.file_size as doc_size, d.mime_type as doc_mime
       from deal_messages m
       left join users u on u.id = m.sender_id
       left join documents d on d.id = m.document_id
      where m.deal_id = $1 and m.seq > $2
      order by m.seq desc limit $3`,
    [ctx.deal.id, opts.afterSeq ?? 0, opts.limit ?? 500],
  );
  return rows.reverse().map((r) => {
    const m = camelize<DealMessage>(r);
    return {
      ...m,
      senderName: (r.sender_name as string) ?? null,
      senderRole: m.senderId === null ? null : m.senderId === ctx.deal.sellerId ? "seller" : "buyer",
      document: m.documentId
        ? { id: m.documentId, fileName: r.doc_file_name as string, documentType: r.doc_type as DocumentType, status: r.doc_status as string, fileSize: r.doc_size as number, mimeType: r.doc_mime as string }
        : null,
    };
  });
}

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "메시지를 입력하세요").max(5000),
  kind: z.enum(["text", "request"]).default("text"),
  /** 자료 요청 메시지일 때 연결할 체크리스트 업무 키 */
  taskKeys: z.array(z.string().max(60)).max(20).default([]),
});

export async function sendMessage(db: Db, viewer: Viewer, dealId: string, input: z.input<typeof sendMessageSchema>): Promise<DealMessage> {
  const ctx = await getDealContext(db, viewer, dealId);
  const parsed = sendMessageSchema.parse(input);
  if (["completed", "cancelled"].includes(ctx.deal.stage)) throw badRequest("종료된 거래에는 메시지를 보낼 수 없습니다.");
  const message = await db.transaction(async (tx) => {
    const rows = await tx.query(`insert into deal_messages (deal_id, sender_id, kind, body) values ($1, $2, $3, $4) returning *`, [
      dealId,
      viewer.id,
      parsed.kind,
      parsed.body,
    ]);
    const m = camelize<DealMessage>(rows[0]);
    await tx.query(`update deals set last_message_at = now() where id = $1`, [dealId]);
    await markRead(tx, dealId, viewer.id, m.seq);
    if (parsed.kind === "request" && parsed.taskKeys.length > 0) {
      const { markTasksRequested } = await import("./requests");
      await markTasksRequested(tx, ctx, parsed.taskKeys, viewer.id, m);
    }
    return m;
  });
  const { maybeAutoRun } = await import("./agent");
  await maybeAutoRun(db, viewer, dealId);
  return message;
}

export async function markRead(db: Db, dealId: string, userId: string, seq?: number): Promise<void> {
  const target =
    seq ?? (await db.query<{ s: number | null }>(`select max(seq) as s from deal_messages where deal_id = $1`, [dealId]))[0]?.s ?? 0;
  await db.query(
    `insert into deal_reads (deal_id, user_id, last_read_seq) values ($1, $2, $3)
     on conflict (deal_id, user_id) do update set last_read_seq = greatest(deal_reads.last_read_seq, excluded.last_read_seq), updated_at = now()`,
    [dealId, userId, target],
  );
}

/**
 * 메신저 파일 공유. 파일은 증빙자료(documents)로 저장되고 메시지에 연결된다.
 * 양도인이 올린 매출·비용·계약 자료는 기존 문서 분석 모듈로 분석한다 (같은 파일은 다시 분석하지 않음).
 * 양수인이 올린 파일은 거래 참고자료로만 저장하고 매물 분석에는 넣지 않는다.
 */
export async function shareFile(
  db: Db,
  viewer: Viewer,
  dealId: string,
  input: { fileName: string; bytes: Uint8Array; documentType: DocumentType; body?: string },
) {
  const ctx = await getDealContext(db, viewer, dealId);
  if (["completed", "cancelled"].includes(ctx.deal.stage)) throw badRequest("종료된 거래에는 파일을 보낼 수 없습니다.");
  const documentType: DocumentType = ctx.role === "seller" ? input.documentType : "other";
  const upload = await saveDocument(db, viewer, ctx.store, {
    storeId: ctx.store.id,
    documentType,
    fileName: input.fileName,
    bytes: input.bytes,
    dealId,
    recordStoreActivity: ctx.role === "seller",
  });

  let analysis: { warnings: string[]; revenueCount: number; expenseCount: number } | null = null;
  let analysisError: string | null = null;
  const alreadyAnalyzed =
    upload.duplicateOf.length > 0 &&
    (await db.query(`select 1 from documents where id = any($1::uuid[]) and status = 'analyzed' limit 1`, [pgArray(upload.duplicateOf)])).length > 0;
  if (ctx.role === "seller" && documentType !== "other") {
    if (alreadyAnalyzed) {
      analysisError = "같은 내용의 파일이 이미 분석되어 다시 분석하지 않았습니다.";
    } else {
      try {
        analysis = await analyzeDocument(db, viewer, upload.document.id);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        analysisError = err.message;
      }
    }
  }

  const message = await db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into deal_messages (deal_id, sender_id, kind, body, document_id) values ($1, $2, 'file', $3, $4) returning *`,
      [dealId, viewer.id, input.body?.slice(0, 5000) ?? "", upload.document.id],
    );
    const m = camelize<DealMessage>(rows[0]);
    await tx.query(`update deals set last_message_at = now() where id = $1`, [dealId]);
    await markRead(tx, dealId, viewer.id, m.seq);
    await recordDealEvent(tx, {
      dealId,
      actorKind: "user",
      actorId: viewer.id,
      type: "file_shared",
      title: `${DOCUMENT_TYPE_LABELS[documentType]} 공유: ${upload.document.fileName}`,
      detail: { documentId: upload.document.id, duplicateOf: upload.duplicateOf },
    });
    if (analysis) {
      await recordDealEvent(tx, {
        dealId,
        actorKind: "system",
        actorId: null,
        type: "document_analyzed",
        title: `문서 분석 완료: ${upload.document.fileName} (매출 ${analysis.revenueCount}건, 비용 ${analysis.expenseCount}건)`,
        detail: { documentId: upload.document.id, warnings: analysis.warnings },
      });
    }
    return m;
  });
  if (ctx.role === "seller") await fulfillRequests(db, ctx.store);
  const { syncDealTasks, maybeAutoRun } = await import("./agent");
  await syncDealTasks(db, ctx);
  await maybeAutoRun(db, viewer, dealId);
  return { message, document: upload.document, duplicateOf: upload.duplicateOf, analysis, analysisError };
}

// -----------------------------------------------------------------------------
// 거래 조건 · 단계 · 메모
// -----------------------------------------------------------------------------
const nullableWon = z.number().int().min(0).max(1e13).nullable();
export const termsPatchSchema = z
  .object({
    premium: nullableWon,
    deposit: nullableWon,
    monthlyRent: nullableWon,
    handoverDate: z.iso.date().nullable(),
    includedAssets: z.string().max(1000).nullable(),
    other: z.string().max(1000).nullable(),
  })
  .partial();

export async function updateTerms(db: Db, viewer: Viewer, dealId: string, patch: z.infer<typeof termsPatchSchema>): Promise<Deal> {
  const ctx = await getDealContext(db, viewer, dealId);
  const changes = (Object.keys(patch) as Array<keyof DealTerms>).filter(
    (k) => patch[k] !== undefined && JSON.stringify(ctx.deal.terms[k] ?? null) !== JSON.stringify(patch[k] ?? null),
  );
  if (changes.length === 0) return ctx.deal;
  return db.transaction(async (tx) => {
    const next = { ...ctx.deal.terms, ...patch };
    for (const k of changes) {
      await tx.query(`insert into deal_term_changes (deal_id, field, old_value, new_value, changed_by) values ($1,$2,$3,$4,$5)`, [
        dealId,
        k,
        JSON.stringify(ctx.deal.terms[k] ?? null),
        JSON.stringify(patch[k] ?? null),
        viewer.id,
      ]);
    }
    const fmt = (v: unknown) => (typeof v === "number" ? `${v.toLocaleString("ko-KR")}원` : v ? String(v) : "없음");
    const text = changes.map((k) => `${DEAL_TERM_LABELS[k]} ${fmt(ctx.deal.terms[k])} → ${fmt(patch[k])}`).join(", ");
    await tx.query(`insert into deal_messages (deal_id, sender_id, kind, body) values ($1, null, 'system', $2)`, [dealId, `거래 조건 변경 (${viewer.displayName}): ${text}`]);
    await recordDealEvent(tx, { dealId, actorKind: "user", actorId: viewer.id, type: "terms_changed", title: `조건 변경: ${text}`, detail: { changes } });
    const rows = await tx.query(`update deals set terms = $2 where id = $1 returning *`, [dealId, JSON.stringify(next)]);
    return camelize<Deal>(rows[0]);
  });
}

export async function listTermChanges(db: Db, dealId: string) {
  return camelizeAll<{ id: string; field: keyof DealTerms; oldValue: unknown; newValue: unknown; changedBy: string | null; changerName: string | null; createdAt: string }>(
    await db.query(
      `select c.*, u.display_name as changer_name from deal_term_changes c left join users u on u.id = c.changed_by
        where c.deal_id = $1 order by c.created_at desc`,
      [dealId],
    ),
  );
}

export const stageSchema = z.object({ stage: z.enum(DEAL_STAGES), note: z.string().max(500).default("") });

/** 거래 단계 변경. 계약 진행·거래 완료는 양도인과 양수인 모두 바꿀 수 있지만 AI는 바꾸지 않는다. */
export async function setStage(db: Db, viewer: Viewer, dealId: string, input: z.infer<typeof stageSchema>): Promise<Deal> {
  const ctx = await getDealContext(db, viewer, dealId);
  if (ctx.deal.stage === input.stage) return ctx.deal;
  if (ctx.deal.stage === "completed") throw forbidden("완료된 거래의 단계는 바꿀 수 없습니다.");
  return db.transaction(async (tx) => {
    const rows = await tx.query(`update deals set stage = $2 where id = $1 returning *`, [dealId, input.stage]);
    const label = `${DEAL_STAGE_LABELS[ctx.deal.stage]} → ${DEAL_STAGE_LABELS[input.stage]}`;
    await tx.query(`insert into deal_messages (deal_id, sender_id, kind, body) values ($1, null, 'system', $2)`, [
      dealId,
      `거래 단계 변경 (${viewer.displayName}): ${label}${input.note ? ` · ${input.note}` : ""}`,
    ]);
    await recordDealEvent(tx, { dealId, actorKind: "user", actorId: viewer.id, type: "stage_changed", title: `거래 단계: ${label}`, detail: { from: ctx.deal.stage, to: input.stage, note: input.note } });
    if (input.stage === "completed") await tx.query(`update stores set listing_status = 'closed' where id = $1`, [ctx.store.id]);
    else if (["negotiation", "collecting", "diligence", "terms", "contract"].includes(input.stage) && ctx.store.listingStatus === "open") {
      await tx.query(`update stores set listing_status = 'negotiating' where id = $1`, [ctx.store.id]);
    }
    return camelize<Deal>(rows[0]);
  });
}

export async function setAutoRun(db: Db, viewer: Viewer, dealId: string, enabled: boolean): Promise<void> {
  await getDealContext(db, viewer, dealId);
  await db.query(`update deals set ai_auto_run = $2 where id = $1`, [dealId, enabled]);
}

export async function getNote(db: Db, viewer: Viewer, dealId: string): Promise<{ body: string; updatedAt: string | null }> {
  await getDealContext(db, viewer, dealId);
  const rows = await db.query<{ body: string; updated_at: string }>(`select body, updated_at from deal_private_notes where deal_id = $1 and user_id = $2`, [dealId, viewer.id]);
  return { body: rows[0]?.body ?? "", updatedAt: rows[0]?.updated_at ?? null };
}

export async function saveNote(db: Db, viewer: Viewer, dealId: string, body: string): Promise<void> {
  await getDealContext(db, viewer, dealId);
  await db.query(
    `insert into deal_private_notes (deal_id, user_id, body) values ($1, $2, $3)
     on conflict (deal_id, user_id) do update set body = excluded.body, updated_at = now()`,
    [dealId, viewer.id, body.slice(0, 10000)],
  );
}

// -----------------------------------------------------------------------------
// 타임라인 (거래 이벤트 + 메시지 요약)
// -----------------------------------------------------------------------------
export interface TimelineItem {
  id: string;
  at: string;
  kind: "event" | "message";
  type: string;
  title: string;
  actorName: string | null;
}

export async function dealTimeline(db: Db, dealId: string, limit = 200): Promise<TimelineItem[]> {
  const events = camelizeAll<DealEvent & { actorName: string | null }>(
    await db.query(
      `select e.*, u.display_name as actor_name from deal_events e left join users u on u.id = e.actor_id where e.deal_id = $1`,
      [dealId],
    ),
  );
  const messages = await db.query<{ id: string; created_at: string; body: string; kind: string; sender_name: string | null }>(
    `select m.id, m.created_at, m.body, m.kind, u.display_name as sender_name from deal_messages m left join users u on u.id = m.sender_id
      where m.deal_id = $1 and m.kind in ('text', 'request')`,
    [dealId],
  );
  return [
    ...events.map((e) => ({ id: e.id, at: e.createdAt, kind: "event" as const, type: e.type, title: e.title, actorName: e.actorKind === "ai" ? "AI" : e.actorKind === "system" ? "시스템" : e.actorName })),
    ...messages.map((m) => ({
      id: m.id,
      at: m.created_at,
      kind: "message" as const,
      type: m.kind === "request" ? "request_message" : "message",
      title: `${m.kind === "request" ? "자료 요청 메시지" : "메시지"}: ${m.body.slice(0, 80)}${m.body.length > 80 ? "…" : ""}`,
      actorName: m.sender_name,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export const DEAL_STAGE_OPTIONS = DEAL_STAGES.map((s) => ({ value: s as DealStage, label: DEAL_STAGE_LABELS[s] }));
