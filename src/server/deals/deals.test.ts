/**
 * 거래 워크스페이스 통합 테스트: 거래 시작 → 메시지 → 파일 공유 → AI 분석 조건·중복 방지 → 위험 추적 → 권한
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalDb, type Db } from "../db/client";
import { listStores } from "../repo/stores";
import { placeholderPdf, seedIfEmpty } from "../seed/seed";
import { DEMO_USERS, type Viewer } from "../viewer";
import { askDealAgent, getEligibility, listFindings, MESSAGE_THRESHOLD, runDealAnalysis } from "./agent";
import { getDealContext, getNote, listDeals, listMessages, saveNote, sendMessage, setStage, shareFile, startDeal, updateTerms } from "./repo";
import { listTasks } from "./tasks";

const seller = DEMO_USERS.seller;
const buyer = DEMO_USERS.buyer;
const stranger: Viewer = { id: "00000000-0000-4000-8000-000000000099", email: "x@demo.local", displayName: "제3자", role: "buyer" };
let db: Db;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "deal-test-"));
  process.env.LOCAL_DATA_DIR = dataDir;
  db = await createLocalDb();
  await seedIfEmpty(db);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"role":"buyer"}')`, [stranger.id, stranger.email]);
});

afterAll(() => {
  delete process.env.LOCAL_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

const storeId = async (name: string) => (await listStores(db, seller)).find((s) => s.name.includes(name))!.id;
const dealFor = async (name: string) => (await listDeals(db, buyer)).find((d) => d.store.name.includes(name))!;

describe("거래 시작", () => {
  it("같은 매물에 다시 문의하면 기존 거래를 돌려준다 (중복 방지)", async () => {
    const id = await storeId("정상 매출");
    const first = await startDeal(db, buyer, { storeId: id });
    expect(first.created).toBe(false);
    expect((await listDeals(db, buyer)).filter((d) => d.store.id === id)).toHaveLength(1);
  });

  it("본인 매물에는 문의할 수 없다", async () => {
    await expect(startDeal(db, seller, { storeId: await storeId("손실 발생") })).rejects.toThrow(/본인 매물/);
  });

  it("거래 시작 시 업종에 맞는 체크리스트와 AI 분석 안내를 만든다", async () => {
    const { deal } = await startDeal(db, buyer, { storeId: await storeId("손실 발생") });
    const tasks = await listTasks(db, deal.id);
    expect(tasks.map((t) => t.key)).toContain("landlord_consent");
    expect(tasks.map((t) => t.key)).not.toContain("delivery_sales"); // 편의점, 배달 자료 없음
    const ctx = await getDealContext(db, buyer, deal.id);
    const msgs = await listMessages(db, ctx);
    expect(msgs[0].kind).toBe("system");
    expect(msgs[0].body).toContain("AI 거래 분석(매출·비용·계약 대조, 위험 확인)에 사용됩니다");
  });
});

describe("권한", () => {
  it("거래 당사자가 아니면 거래를 볼 수 없다", async () => {
    const d = await dealFor("매출 불일치");
    await expect(getDealContext(db, stranger, d.deal.id)).rejects.toThrow(/찾을 수 없습니다/);
    await expect(sendMessage(db, stranger, d.deal.id, { body: "hi" })).rejects.toThrow(/찾을 수 없습니다/);
  });

  it("비공개 메모는 작성자에게만 보인다", async () => {
    const d = await dealFor("매출 불일치");
    await saveNote(db, buyer, d.deal.id, "권리금 6천까지만");
    expect((await getNote(db, buyer, d.deal.id)).body).toBe("권리금 6천까지만");
    expect((await getNote(db, seller, d.deal.id)).body).toBe("");
  });

  it("양도인이 AI에게 위험을 물으면 양수인 검토 내용을 공개하지 않는다", async () => {
    const d = await dealFor("매출 불일치");
    const [, answer] = await askDealAgent(db, seller, d.deal.id, "지금까지 발견된 위험을 정리해 줘");
    expect(answer.content).toContain("양수인의 검토 내용은 공개하지 않습니다");
  });
});

describe("AI 분석 실행 조건과 중복 방지", () => {
  it("메시지 12건이 쌓인 거래는 분석 가능 상태다", async () => {
    const d = await dealFor("매출 불일치");
    const ctx = await getDealContext(db, buyer, d.deal.id);
    const e = await getEligibility(db, ctx);
    expect(e.newMessages).toBeGreaterThanOrEqual(MESSAGE_THRESHOLD);
    expect(e.eligible).toBe(true);
  });

  it("분석 결과: 발언 모순·계약서 불일치·주장 매출 차이를 근거 메시지와 함께 찾는다", async () => {
    const d = await dealFor("매출 불일치");
    const run = await runDealAnalysis(db, buyer, d.deal.id);
    expect(run.fromSeq).toBe(0);
    const findings = await listFindings(db, d.deal.id);
    const keys = findings.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["contradiction:revenue", "contract_mismatch:rent", "claim_vs_evidence:revenue", "statement:solo", "claim:cash_ratio"]));
    const rent = findings.find((f) => f.key === "contract_mismatch:rent")!;
    expect(rent.level).toBe("HIGH");
    expect(rent.certainty).toBe("fact");
    expect(rent.evidence.some((e) => e.kind === "message" && e.seq)).toBe(true);
    // 양도인의 최신 주장(4,000만)과 증빙(3,200만)을 비교한다
    expect(findings.find((f) => f.key === "claim_vs_evidence:revenue")!.detail).toContain("40,000,000원");
    expect(run.result.requestMessage).toContain("자료를 요청드립니다");
  });

  it("같은 입력으로는 다시 분석하지 않는다", async () => {
    const d = await dealFor("매출 불일치");
    await expect(runDealAnalysis(db, buyer, d.deal.id)).rejects.toThrow(/다시 분석하지 않습니다/);
  });

  it("새 메시지가 기준 미만이면 실행하지 않는다", async () => {
    const d = await dealFor("매출 불일치");
    await sendMessage(db, buyer, d.deal.id, { body: "확인했습니다" });
    await expect(runDealAnalysis(db, buyer, d.deal.id)).rejects.toThrow(/분석 조건을 충족하지 않았습니다/);
  });

  it("양도인이 증빙 파일을 공유하고 문서 분석이 끝나면 분석 가능 상태가 되고, 다음 분석은 새 메시지만 읽는다", async () => {
    const d = await dealFor("증빙 부족");
    const ctx = await getDealContext(db, seller, d.deal.id);
    const first = await runDealAnalysis(db, buyer, d.deal.id, { force: true });
    const r = await shareFile(db, seller, d.deal.id, { fileName: "POS_월별매출.pdf", bytes: placeholderPdf(["pos"]), documentType: "pos_sales", body: "POS 자료 첨부합니다" });
    expect(r.analysis?.revenueCount).toBeGreaterThan(0);
    const tasksAfterUpload = await listTasks(db, d.deal.id);
    expect(tasksAfterUpload.find((t) => t.key === "pos_sales")!.status).toBe("reviewing");
    const e = await getEligibility(db, ctx);
    expect(e.eligible).toBe(true);
    expect(e.newDocuments.map((x) => x.fileName)).toContain("POS_월별매출.pdf");
    const second = await runDealAnalysis(db, buyer, d.deal.id);
    expect(second.fromSeq).toBe(first.toSeq);
    expect(second.trigger).toBe("documents");
  });

  it("위험이 해소되면 다음 분석에서 해결됨으로 바뀐다", async () => {
    const d = await dealFor("증빙 부족");
    const before = await listFindings(db, d.deal.id);
    expect(before.find((f) => f.key === "engine:EVID_NO_POS")?.status).toBe("resolved");
  });

  it("업로드만으로는 완료 처리하지 않고, 사용자가 완료한 업무는 AI가 되돌리지 않는다", async () => {
    const d = await dealFor("증빙 부족");
    const pos = (await listTasks(db, d.deal.id)).find((t) => t.key === "pos_sales")!;
    expect(pos.status).not.toBe("submitted");
    expect(["reviewing", "done", "needs_more"]).toContain(pos.status);
  });
});

describe("조건·단계", () => {
  it("조건 변경은 이전 값과 함께 기록하고 시스템 메시지를 남긴다", async () => {
    const d = await dealFor("매출 불일치");
    await updateTerms(db, buyer, d.deal.id, { premium: 60_000_000 });
    const ctx = await getDealContext(db, buyer, d.deal.id);
    expect(ctx.deal.terms.premium).toBe(60_000_000);
    const rows = await db.query<{ old_value: number; new_value: number }>(`select old_value, new_value from deal_term_changes where deal_id = $1`, [d.deal.id]);
    expect(rows[0]).toEqual({ old_value: 80_000_000, new_value: 60_000_000 });
    const msgs = await listMessages(db, ctx);
    expect(msgs.at(-1)!.body).toContain("희망 권리금 80,000,000원 → 60,000,000원");
  });

  it("거래 단계는 사용자가 바꾸고 이력이 남는다", async () => {
    const d = await dealFor("매출 불일치");
    await setStage(db, buyer, d.deal.id, { stage: "collecting", note: "" });
    const ev = await db.query<{ type: string }>(`select type from deal_events where deal_id = $1 and type = 'stage_changed'`, [d.deal.id]);
    expect(ev).toHaveLength(1);
  });
});
