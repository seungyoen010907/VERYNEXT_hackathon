import { z } from "zod";
import type { Store, StoreStatus } from "@/types/domain";
import { STORE_STATUSES } from "@/types/domain";
import type { Db } from "../db/client";
import { notFound } from "../errors";
import { assertCanEdit, canView, type Viewer } from "../viewer";
import { recordActivity } from "./activities";
import { camelize, camelizeAll, snake } from "./mappers";

const won = z.number().int("정수(원 단위)로 입력하세요").min(0, "0 이상이어야 합니다").max(1e13);
const nullableWon = won.nullable();

export const storeInputSchema = z.object({
  name: z.string().trim().min(1, "점포명을 입력하세요").max(100),
  industry: z.string().trim().min(1, "업종을 입력하세요").max(50),
  address: z.string().trim().min(1, "주소를 입력하세요").max(200),
  region: z.string().trim().max(50).optional(),
  businessPeriodMonths: z.number().int().min(0).max(1200).nullable().default(null),
  deposit: won,
  monthlyRent: won,
  premium: won,
  claimedMonthlyRevenue: nullableWon.default(null),
  claimedMonthlyNetProfit: z.number().int().min(-1e13).max(1e13).nullable().default(null),
  facilityInvestment: nullableWon.default(null),
  otherInitialCost: nullableWon.default(null),
  description: z.string().max(5000).default(""),
  isPublished: z.boolean().default(false),
  listingStatus: z.enum(["open", "negotiating", "closed"]).default("open"),
  facilityDescription: z.string().max(3000).default(""),
  dealConditions: z.string().max(3000).default(""),
  discloseFinancials: z.boolean().default(true),
});
export type StoreInput = z.infer<typeof storeInputSchema>;
export const storePatchSchema = storeInputSchema.partial();

/** "서울특별시 마포구 ..." → "서울 마포구" */
export function regionFromAddress(address: string): string {
  const [a = "", b = ""] = address.trim().split(/\s+/);
  const short = a
    .replace(/(특별자치시|특별자치도|특별시|광역시)$/, "")
    .replace(/^(경기|강원|충청북|충청남|전라북|전라남|경상북|경상남|제주)도$/, "$1")
    .replace(/^충청북$/, "충북").replace(/^충청남$/, "충남")
    .replace(/^전라북$/, "전북").replace(/^전라남$/, "전남")
    .replace(/^경상북$/, "경북").replace(/^경상남$/, "경남");
  return `${short} ${/[시군구]$/.test(b) ? b : ""}`.trim().slice(0, 50) || "미분류";
}

export interface StoreFilters {
  q?: string;
  industry?: string;
  region?: string;
  status?: StoreStatus;
}

/** 사용자가 볼 수 있는 매물 조건 */
function visibilitySql(viewer: Viewer, param: number): string {
  return viewer.role === "admin" ? "true" : `(s.owner_id = $${param} or s.is_published)`;
}

export async function listStores(db: Db, viewer: Viewer, filters: StoreFilters = {}): Promise<Store[]> {
  const params: unknown[] = [viewer.id];
  const where = [visibilitySql(viewer, 1)];
  if (filters.q) {
    params.push(`%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(s.name ilike $${params.length} or s.address ilike $${params.length} or s.industry ilike $${params.length})`);
  }
  if (filters.industry) {
    params.push(filters.industry);
    where.push(`s.industry = $${params.length}`);
  }
  if (filters.region) {
    params.push(filters.region);
    where.push(`s.region = $${params.length}`);
  }
  if (filters.status && (STORE_STATUSES as readonly string[]).includes(filters.status)) {
    params.push(filters.status);
    where.push(`s.status = $${params.length}`);
  }
  const rows = await db.query(
    `select s.* from stores s where ${where.join(" and ")} order by s.created_at desc, s.id`,
    params,
  );
  return camelizeAll<Store>(rows);
}

export async function visibleStoreIds(db: Db, viewer: Viewer): Promise<string[]> {
  const rows = await db.query<{ id: string }>(`select s.id from stores s where ${visibilitySql(viewer, 1)}`, [viewer.id]);
  return rows.map((r) => r.id);
}

/** 볼 권한이 없으면 존재 여부를 드러내지 않도록 404를 낸다. */
export async function getStore(db: Db, viewer: Viewer, id: string): Promise<Store> {
  if (!z.uuid().safeParse(id).success) throw notFound("매물");
  const rows = await db.query(`select * from stores where id = $1`, [id]);
  if (rows.length === 0) throw notFound("매물");
  const store = camelize<Store>(rows[0]);
  if (canView(viewer, store)) return store;
  // 거래 중인 양수인은 매물이 비공개로 바뀌어도 계속 볼 수 있다 (RLS 정책과 동일)
  const deal = await db.query(`select 1 from deals where store_id = $1 and buyer_id = $2 limit 1`, [id, viewer.id]);
  if (deal.length === 0) throw notFound("매물");
  return store;
}

export async function getEditableStore(db: Db, viewer: Viewer, id: string): Promise<Store> {
  const store = await getStore(db, viewer, id);
  assertCanEdit(viewer, store);
  return store;
}

export async function createStore(
  db: Db,
  viewer: Viewer,
  rawInput: z.input<typeof storeInputSchema>,
  opts: { isTestData?: boolean } = {},
): Promise<Store> {
  const input: StoreInput = storeInputSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into stores (owner_id, name, industry, address, region, business_period_months, deposit,
         monthly_rent, premium, claimed_monthly_revenue, claimed_monthly_net_profit, facility_investment,
         other_initial_cost, description, is_published, is_test_data, listing_status, facility_description,
         deal_conditions, disclose_financials)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning *`,
      [
        viewer.id,
        input.name,
        input.industry,
        input.address,
        input.region || regionFromAddress(input.address),
        input.businessPeriodMonths,
        input.deposit,
        input.monthlyRent,
        input.premium,
        input.claimedMonthlyRevenue,
        input.claimedMonthlyNetProfit,
        input.facilityInvestment,
        input.otherInitialCost,
        input.description,
        input.isPublished,
        opts.isTestData ?? false,
        input.listingStatus,
        input.facilityDescription,
        input.dealConditions,
        input.discloseFinancials,
      ],
    );
    const store = camelize<Store>(rows[0]);
    await recordActivity(tx, { storeId: store.id, actorId: viewer.id, type: "store_created", title: `점포 등록: ${store.name}` });
    return store;
  });
}

const PATCHABLE = Object.keys(storeInputSchema.shape) as Array<keyof StoreInput>;

export async function updateStore(
  db: Db,
  viewer: Viewer,
  id: string,
  patch: Partial<StoreInput>,
): Promise<Store> {
  const before = await getEditableStore(db, viewer, id);
  const sets: string[] = [];
  const params: unknown[] = [id];
  const changed: string[] = [];
  for (const key of PATCHABLE) {
    if (patch[key] === undefined) continue;
    const value = key === "region" && !patch.region ? regionFromAddress(patch.address ?? before.address) : patch[key];
    if ((before as unknown as Record<string, unknown>)[key] === value) continue;
    params.push(value);
    sets.push(`${snake(key)} = $${params.length}`);
    changed.push(key);
  }
  if (changed.includes("address") && patch.region === undefined) {
    params.push(regionFromAddress(patch.address ?? before.address));
    sets.push(`region = $${params.length}`);
  }
  if (sets.length === 0) return before;
  return db.transaction(async (tx) => {
    const rows = await tx.query(`update stores set ${sets.join(", ")} where id = $1 returning *`, params);
    await recordActivity(tx, {
      storeId: id,
      actorId: viewer.id,
      type: "store_updated",
      title: "점포 정보 수정",
      detail: { changedFields: changed },
    });
    return camelize<Store>(rows[0]);
  });
}

export async function deleteStore(db: Db, viewer: Viewer, id: string): Promise<void> {
  await getEditableStore(db, viewer, id);
  await db.query(`delete from stores where id = $1`, [id]);
}

export async function setStoreStatus(db: Db, id: string, status: StoreStatus): Promise<void> {
  await db.query(`update stores set status = $2 where id = $1`, [id, status]);
}

export async function listFilterOptions(db: Db, viewer: Viewer) {
  const rows = await db.query<{ industry: string; region: string }>(
    `select distinct s.industry, s.region from stores s where ${visibilitySql(viewer, 1)}`,
    [viewer.id],
  );
  return {
    industries: [...new Set(rows.map((r) => r.industry))].sort(),
    regions: [...new Set(rows.map((r) => r.region))].sort(),
  };
}
