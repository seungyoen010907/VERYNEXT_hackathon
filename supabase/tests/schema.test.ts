import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb } from "./helpers/test-db";

const SELLER = "11111111-1111-1111-1111-111111111111";
const BUYER = "22222222-2222-2222-2222-222222222222";
const OTHER_SELLER = "33333333-3333-3333-3333-333333333333";

const EXPECTED_TABLES = [
  "users",
  "stores",
  "documents",
  "extracted_data",
  "normalized_data",
  "monthly_revenues",
  "monthly_expenses",
  "analyses",
  "revenue_verifications",
  "profit_analyses",
  "premium_analyses",
  "risk_assessments",
  "reports",
  "chat_messages",
  "document_requests",
  "activities",
  "deals",
  "deal_messages",
  "deal_reads",
  "deal_tasks",
  "deal_task_events",
  "deal_ai_runs",
  "deal_ai_findings",
  "deal_ai_messages",
  "deal_events",
  "deal_term_changes",
  "deal_private_notes",
  "deal_reports",
];

let db: PGlite;

async function insertStore(ownerId: string, overrides: Record<string, unknown> = {}) {
  const row = {
    owner_id: ownerId,
    name: "테스트 카페",
    industry: "카페",
    address: "서울특별시 마포구 테스트로 1",
    region: "서울 마포구",
    deposit: 30_000_000,
    monthly_rent: 2_000_000,
    premium: 50_000_000,
    ...overrides,
  };
  const cols = Object.keys(row);
  const res = await db.query<{ id: string }>(
    `insert into public.stores (${cols.join(", ")})
     values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return res.rows[0].id;
}

async function insertAnalysis(storeId: string) {
  const res = await db.query<{ id: string }>(
    `insert into public.analyses (store_id, engine_version) values ($1, 'test') returning id`,
    [storeId],
  );
  return res.rows[0].id;
}

beforeAll(async () => {
  db = await createTestDb();
  await createAuthUser(db, SELLER, "seller@test.local", { role: "seller", display_name: "양도인" });
  await createAuthUser(db, BUYER, "buyer@test.local", { role: "buyer" });
  await createAuthUser(db, OTHER_SELLER, "other@test.local", { role: "seller" });
});

afterAll(async () => {
  await db?.close();
});

describe("마이그레이션", () => {
  it("28개 테이블을 모두 생성하고 전부 RLS를 켠다", async () => {
    const res = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(res.rows.map((r) => r.tablename).sort()).toEqual([...EXPECTED_TABLES].sort());
    expect(res.rows.every((r) => r.rowsecurity)).toBe(true);
  });
});

describe("users", () => {
  it("가입 시 프로필을 자동 생성하고 메타데이터의 역할을 반영한다", async () => {
    const res = await db.query<{ role: string; display_name: string }>(
      `select role, display_name from public.users where id = $1`,
      [SELLER],
    );
    expect(res.rows[0]).toEqual({ role: "seller", display_name: "양도인" });
  });

  it("메타데이터로 admin 역할을 요청해도 buyer로 만든다", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    await createAuthUser(db, id, "attacker@test.local", { role: "admin" });
    const res = await db.query<{ role: string }>(`select role from public.users where id = $1`, [id]);
    expect(res.rows[0].role).toBe("buyer");
  });

  it("사용자는 자신의 role을 직접 바꿀 수 없다", async () => {
    await expect(
      asUser(db, BUYER, () => db.query(`update public.users set role = 'admin' where id = $1`, [BUYER])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("stores 제약조건", () => {
  it("음수 금액을 거부한다", async () => {
    await expect(insertStore(SELLER, { premium: -1 })).rejects.toThrow(/check constraint/);
  });

  it("양도인 주장 순수익은 손실(음수)을 허용한다", async () => {
    await expect(insertStore(SELLER, { claimed_monthly_net_profit: -500_000 })).resolves.toBeTruthy();
  });

  it("확인되지 않은 값은 NULL로 저장한다 (0으로 채우지 않는다)", async () => {
    const id = await insertStore(SELLER);
    const res = await db.query<Record<string, unknown>>(
      `select claimed_monthly_revenue, facility_investment from public.stores where id = $1`,
      [id],
    );
    expect(res.rows[0]).toEqual({ claimed_monthly_revenue: null, facility_investment: null });
  });
});

describe("extracted_data 원본 보존", () => {
  it("저장된 원본은 수정할 수 없다", async () => {
    const storeId = await insertStore(SELLER);
    const res = await db.query<{ id: string }>(
      `insert into public.extracted_data (store_id, provider, schema_version, raw_payload)
       values ($1, 'sample', '1.0', '{"pos": 30000000}') returning id`,
      [storeId],
    );
    await expect(
      db.query(`update public.extracted_data set raw_payload = '{}' where id = $1`, [res.rows[0].id]),
    ).rejects.toThrow(/수정할 수 없습니다/);
  });
});

describe("분석 결과의 점포-분석 일관성", () => {
  it("다른 점포의 분석 ID로 결과를 저장할 수 없다", async () => {
    const storeA = await insertStore(SELLER);
    const storeB = await insertStore(SELLER);
    const analysisOfA = await insertAnalysis(storeA);
    await expect(
      db.query(
        `insert into public.risk_assessments
           (analysis_id, store_id, rule_id, category, level, title, cause, recommended_action)
         values ($1, $2, 'R1', 'revenue_mismatch', 'HIGH', '제목', '원인', '조치')`,
        [analysisOfA, storeB],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("위험 평가는 원인과 권장 조치를 반드시 기록한다", async () => {
    const storeId = await insertStore(SELLER);
    const analysisId = await insertAnalysis(storeId);
    await expect(
      db.query(
        `insert into public.risk_assessments
           (analysis_id, store_id, rule_id, category, level, title, cause, recommended_action)
         values ($1, $2, 'R1', 'revenue_mismatch', 'HIGH', '제목', '', '조치')`,
        [analysisId, storeId],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("회수 기간이 '계산 가능'일 때만 개월 수를 저장한다", async () => {
    const storeId = await insertStore(SELLER);
    const analysisId = await insertAnalysis(storeId);
    await expect(
      db.query(
        `insert into public.premium_analyses
           (analysis_id, store_id, deposit, premium, payback_status, payback_months, basis)
         values ($1, $2, 0, 0, 'not_recoverable', 12, '기준')`,
        [analysisId, storeId],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("같은 점포는 분석 이력을 여러 건 보존한다", async () => {
    const storeId = await insertStore(SELLER);
    await insertAnalysis(storeId);
    await insertAnalysis(storeId);
    const res = await db.query<{ n: number }>(
      `select count(*)::int as n from public.analyses where store_id = $1`,
      [storeId],
    );
    expect(res.rows[0].n).toBe(2);
  });
});

describe("행 수준 보안 (RLS)", () => {
  let privateStore: string;
  let publishedStore: string;

  beforeAll(async () => {
    privateStore = await insertStore(SELLER, { name: "비공개 매물" });
    publishedStore = await insertStore(SELLER, { name: "공개 매물", is_published: true });
    await db.query(
      `insert into public.documents (store_id, document_type, file_name, storage_path, mime_type, file_size)
       values ($1, 'pos_sales', 'pos.pdf', $2, 'application/pdf', 100)`,
      [publishedStore, `${publishedStore}/pos.pdf`],
    );
    await insertAnalysis(publishedStore);
  });

  it("양수인은 공개 매물만 조회한다", async () => {
    const names = await asUser(db, BUYER, async () => {
      const res = await db.query<{ id: string }>(`select id from public.stores`);
      return res.rows.map((r) => r.id);
    });
    expect(names).toContain(publishedStore);
    expect(names).not.toContain(privateStore);
  });

  it("양수인은 공개 매물의 분석 결과는 보지만 원본 문서는 보지 못한다", async () => {
    const [analyses, documents] = await asUser(db, BUYER, async () => {
      const a = await db.query(`select id from public.analyses where store_id = $1`, [publishedStore]);
      const d = await db.query(`select id from public.documents where store_id = $1`, [publishedStore]);
      return [a.rows.length, d.rows.length];
    });
    expect(analyses).toBe(1);
    expect(documents).toBe(0);
  });

  it("다른 사용자 명의로 매물을 등록할 수 없다", async () => {
    await expect(
      asUser(db, OTHER_SELLER, () =>
        db.query(
          `insert into public.stores (owner_id, name, industry, address, region, deposit, monthly_rent, premium)
           values ($1, 'x', 'x', 'x', 'x', 0, 0, 0)`,
          [SELLER],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("다른 양도인의 매물은 수정되지 않는다", async () => {
    const updated = await asUser(db, OTHER_SELLER, async () => {
      const res = await db.query(`update public.stores set premium = 0 where id = $1 returning id`, [
        publishedStore,
      ]);
      return res.rows.length;
    });
    expect(updated).toBe(0);
  });

  it("일반 사용자는 분석 결과 테이블에 직접 쓸 수 없다", async () => {
    const analysisId = await insertAnalysis(publishedStore);
    await expect(
      asUser(db, SELLER, () =>
        db.query(
          `insert into public.risk_assessments
             (analysis_id, store_id, rule_id, category, level, title, cause, recommended_action)
           values ($1, $2, 'R1', 'revenue_mismatch', 'LOW', '제목', '원인', '조치')`,
          [analysisId, publishedStore],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("거래 워크스페이스 RLS (0003)", () => {
  const OTHER_BUYER = "55555555-5555-5555-5555-555555555555";
  let storeId: string;
  let dealId: string;
  let sharedDoc: string;
  let privateDoc: string;

  beforeAll(async () => {
    await createAuthUser(db, OTHER_BUYER, "buyer2@test.local", { role: "buyer" });
    storeId = await insertStore(SELLER, { name: "거래 매물", is_published: true });
    dealId = await asUser(db, BUYER, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.deals (store_id, seller_id, buyer_id) values ($1, $2, $3) returning id`,
        [storeId, SELLER, BUYER],
      );
      return r.rows[0].id;
    });
    const mkDoc = async (name: string) =>
      (
        await db.query<{ id: string }>(
          `insert into public.documents (store_id, document_type, file_name, storage_path, mime_type, file_size)
           values ($1, 'pos_sales', $2, $3, 'application/pdf', 10) returning id`,
          [storeId, name, `${storeId}/${name}`],
        )
      ).rows[0].id;
    sharedDoc = await mkDoc("shared.pdf");
    privateDoc = await mkDoc("private.pdf");
    await db.query(`insert into public.deal_messages (deal_id, sender_id, kind, body, document_id) values ($1, $2, 'file', '', $3)`, [
      dealId,
      SELLER,
      sharedDoc,
    ]);
    await db.query(`insert into public.deal_private_notes (deal_id, user_id, body) values ($1, $2, '협상 전략')`, [dealId, BUYER]);
  });

  it("같은 매물·양수인 조합의 거래는 하나만 만들 수 있다", async () => {
    await expect(
      db.query(`insert into public.deals (store_id, seller_id, buyer_id) values ($1, $2, $3)`, [storeId, SELLER, BUYER]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("거래 당사자가 아니면 거래와 메시지를 볼 수 없다", async () => {
    const [deals, msgs] = await asUser(db, OTHER_BUYER, async () => [
      (await db.query(`select id from public.deals where id = $1`, [dealId])).rows.length,
      (await db.query(`select id from public.deal_messages where deal_id = $1`, [dealId])).rows.length,
    ]);
    expect([deals, msgs]).toEqual([0, 0]);
  });

  it("메신저로 공유된 문서만 양수인에게 보인다", async () => {
    const ids = await asUser(db, BUYER, async () =>
      (await db.query<{ id: string }>(`select id from public.documents where store_id = $1`, [storeId])).rows.map((r) => r.id),
    );
    expect(ids).toContain(sharedDoc);
    expect(ids).not.toContain(privateDoc);
  });

  it("비공개 메모는 작성자만 본다", async () => {
    const sellerSees = await asUser(db, SELLER, async () =>
      (await db.query(`select body from public.deal_private_notes where deal_id = $1`, [dealId])).rows.length,
    );
    expect(sellerSees).toBe(0);
  });

  it("메시지는 수정할 수 없다", async () => {
    await expect(db.query(`update public.deal_messages set body = 'x' where deal_id = $1`, [dealId])).rejects.toThrow(/수정할 수 없습니다/);
  });

  it("AI·시스템의 체크리스트 상태 변경은 근거 없이 기록할 수 없다", async () => {
    const task = await db.query<{ id: string }>(
      `insert into public.deal_tasks (deal_id, key, task_group, title, assignee_role) values ($1, 'pos', 'revenue', 'POS', 'buyer') returning id`,
      [dealId],
    );
    await expect(
      db.query(
        `insert into public.deal_task_events (task_id, deal_id, actor_kind, from_status, to_status) values ($1, $2, 'ai', 'requested', 'done')`,
        [task.rows[0].id, dealId],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
