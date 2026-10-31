import "server-only";

// 거래방 = 매물(deals 테이블) × 양수인 한 쌍 (PRD 11.2). 양도인·양수인 직접 대화와 계약 단계 체크리스트.
// - 체크리스트는 양수인이 처음 거래방을 열 때 lib/roadmap.ts 템플릿으로 만든다.
// - 자료 제출 항목은 직접 체크하지 않고, 데이터룸에 그 종류 자료가 양수인에게 공개(L0~L2)돼 있으면 저절로 완료된다.
// - 지금 단계는 저장하지 않고 체크리스트에서 계산한다: 아직 안 끝난 항목이 있는 첫 단계.

import { getUser, type CurrentUser } from "./auth";
import { HttpError } from "./http";
import { getListing } from "./listings";
import { buildChecklist, STAGES, stageTitle, templateFor } from "./roadmap";
import { getSupabase } from "./supabase";
import type { ChecklistItem, DocType, Listing, MessageRole, StageKey } from "./types";

// 체크리스트 key → 데이터룸 자료 종류 (AI가 판독한 doc_type)
const AUTO_DOC_TYPE: Record<string, DocType> = {
  card_sales: "card_sales",
  delivery_sales: "delivery_app",
  pos_report: "pos",
  vat_return: "vat_return",
};

export type DealRoomContext = {
  user: CurrentUser;
  listing: Listing;
  buyerId: string;
  isOwner: boolean;
  myRole: "seller" | "buyer";
};

const UUID = /^[0-9a-f-]{36}$/i;

// 거래방에 들어갈 수 있는지 확인한다.
// 양수인: 공개 중인 남의 매물이면 자기 거래방. 양도인: 내 매물 + 이미 열린 양수인 거래방만 (?buyer=).
export async function openDealRoom(request: Request, listingId: string, buyerParam: string | null): Promise<DealRoomContext> {
  const user = await getUser(request);
  const listing = await getListing(listingId);
  const supabase = getSupabase();

  if (listing.seller_id === user.id) {
    if (!buyerParam || !UUID.test(buyerParam)) throw new HttpError(400, "어느 양수인과의 거래방인지(buyer) 보내주세요.");
    const { count, error } = await supabase
      .from("checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("deal_id", listing.id)
      .eq("buyer_id", buyerParam);
    if (error) throw error;
    if (!count) throw new HttpError(404, "아직 이 양수인과의 거래방이 없어요.");
    return { user, listing, buyerId: buyerParam, isOwner: true, myRole: "seller" };
  }

  if (listing.status !== "published") throw new HttpError(404, "매물을 찾을 수 없어요.");
  if (!user.roles.includes("buyer")) throw new HttpError(403, "양수인만 거래방을 열 수 있어요.");
  if (buyerParam && buyerParam !== user.id) throw new HttpError(403, "내 거래방만 볼 수 있어요.");
  return { user, listing, buyerId: user.id, isOwner: false, myRole: "buyer" };
}

// 양수인이 처음 열면 템플릿으로 체크리스트를 만든다. 두 번 불려도 (deal_id, buyer_id, key) unique라 중복되지 않는다.
export async function ensureChecklist(listingId: string, buyerId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", listingId)
    .eq("buyer_id", buyerId);
  if (error) throw error;
  if (count) return false;
  // guide는 DB가 아니라 lib/roadmap.ts에서 붙인다
  const rows = buildChecklist().map((r) => ({
    stage: r.stage,
    role: r.role,
    key: r.key,
    title: r.title,
    status: r.status,
    sort: r.sort,
    deal_id: listingId,
    buyer_id: buyerId,
  }));
  const { error: insertError } = await supabase
    .from("checklist_items")
    .upsert(rows, { onConflict: "deal_id,buyer_id,key", ignoreDuplicates: true });
  if (insertError) throw insertError;
  return true;
}

type ChecklistRow = Omit<ChecklistItem, "guide" | "auto"> & { deal_id: string; buyer_id: string; updated_at: string };

// 양수인에게 공개된(L3가 아닌) 자료의 종류. L3 자료는 있다는 사실도 양수인에게 알리지 않는다.
async function sharedDocTypes(listingIds: string[]): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (listingIds.length === 0) return result;
  const { data, error } = await getSupabase()
    .from("documents")
    .select("deal_id, extraction, access_level, summary_access_level")
    .in("deal_id", listingIds)
    .neq("kind", "report");
  if (error) throw error;
  for (const d of data ?? []) {
    if (d.access_level === "L3" && d.summary_access_level === "L3") continue;
    const type = (d.extraction as { doc_type?: string } | null)?.doc_type;
    if (!type) continue;
    if (!result.has(d.deal_id)) result.set(d.deal_id, new Set());
    result.get(d.deal_id)!.add(type);
  }
  return result;
}

// DB 행 + 자동 항목 상태 + 안내 문구 → 화면용 체크리스트
function toChecklist(rows: ChecklistRow[], docTypes: Set<string> | undefined): ChecklistItem[] {
  return rows
    .map((r) => {
      const autoType = AUTO_DOC_TYPE[r.key];
      const status = autoType ? (docTypes?.has(autoType) ? "done" : "todo") : r.status;
      return {
        id: r.id,
        stage: r.stage,
        role: r.role,
        key: r.key,
        title: r.title,
        status,
        sort: r.sort,
        guide: templateFor(r.key)?.guide ?? null,
        auto: !!autoType,
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

// 항목이 끝났는지: 인수인계 항목은 양수인 '확인 완료'까지 받아야 끝난다
export const isFinished = (i: ChecklistItem) => (templateFor(i.key)?.confirm ? i.status === "confirmed" : i.status !== "todo");

export function currentStage(items: ChecklistItem[]): { stage: StageKey; completed: boolean } {
  for (const s of STAGES) {
    if (items.some((i) => i.stage === s.key && !isFinished(i))) return { stage: s.key, completed: false };
  }
  return { stage: STAGES[STAGES.length - 1].key, completed: true };
}

// 그 역할이 지금 해야 할 일 개수. 양수인은 '확인 완료'를 눌러야 하는 인수인계 항목도 센다.
export function todoCount(items: ChecklistItem[], role: "seller" | "buyer"): number {
  return items.filter((i) => {
    const confirm = templateFor(i.key)?.confirm;
    if (role === "buyer" && confirm) return i.status === "done";
    return i.role === role && i.status === "todo";
  }).length;
}

// 여러 거래방의 체크리스트를 한 번에 불러온다. key = `${listingId}:${buyerId}`
export async function loadChecklists(filter: { listingIds?: string[]; buyerId?: string }) {
  let query = getSupabase().from("checklist_items").select("id, deal_id, buyer_id, stage, role, key, title, status, sort, updated_at");
  if (filter.listingIds) query = query.in("deal_id", filter.listingIds);
  if (filter.buyerId) query = query.eq("buyer_id", filter.buyerId);
  const { data, error } = await query.not("buyer_id", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as ChecklistRow[];
  const docTypes = await sharedDocTypes([...new Set(rows.map((r) => r.deal_id))]);

  const grouped = new Map<string, ChecklistRow[]>();
  for (const r of rows) {
    const key = `${r.deal_id}:${r.buyer_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  const rooms = new Map<string, { listingId: string; buyerId: string; openedAt: string; items: ChecklistItem[] }>();
  for (const [key, group] of grouped) {
    const [listingId, buyerId] = key.split(":");
    const openedAt = group.reduce((min, r) => (r.updated_at < min ? r.updated_at : min), group[0].updated_at);
    rooms.set(key, { listingId, buyerId, openedAt, items: toChecklist(group, docTypes.get(listingId)) });
  }
  return rooms;
}

export async function loadRoomChecklist(listingId: string, buyerId: string): Promise<ChecklistItem[]> {
  const rooms = await loadChecklists({ listingIds: [listingId], buyerId });
  return rooms.get(`${listingId}:${buyerId}`)?.items ?? [];
}

export async function postMessage(listingId: string, buyerId: string, role: MessageRole, body: string) {
  const { data, error } = await getSupabase()
    .from("messages")
    .insert({ deal_id: listingId, buyer_id: buyerId, role, body })
    .select("id, created_at, role, body")
    .single();
  if (error) throw error;
  return data;
}

// 단계가 바뀌었으면 에이전트 안내 메시지를 남긴다
export async function announceStageChange(
  listingId: string,
  buyerId: string,
  before: { stage: StageKey; completed: boolean },
  after: { stage: StageKey; completed: boolean },
) {
  if (before.stage === after.stage && before.completed === after.completed) return;
  const body = after.completed
    ? "모든 단계를 마쳤어요. 인수인계까지 끝났어요."
    : STAGES.findIndex((s) => s.key === after.stage) > STAGES.findIndex((s) => s.key === before.stage)
      ? `'${stageTitle(before.stage)}' 단계를 마쳤어요. 이제 '${stageTitle(after.stage)}' 단계예요.`
      : `'${stageTitle(after.stage)}' 단계에 다시 할 일이 생겼어요.`;
  await postMessage(listingId, buyerId, "agent", body);
}

export async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getSupabase().from("users").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((u) => [u.id, u.name]));
}
