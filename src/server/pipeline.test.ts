/**
 * 저장소 통합 테스트: 실제 마이그레이션을 적용한 메모리 DB에서
 * 시드 → 업로드 → 분석 결과 수신 → 종합 분석 → 체크리스트·요청·보고서·상담 흐름을 검증한다.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalDb, type Db } from "./db/client";
import { importExtraction, analyzeDocument } from "./ingest/service";
import { createAndRunFullAnalysis, getAnalysisBundle, latestAnalysisSummaries } from "./repo/analyses";
import { askQuestion } from "./repo/chat";
import { computeProgress, getChecklist, listRequests } from "./repo/diligence";
import { listDocuments, uploadDocument } from "./repo/documents";
import { listActivities } from "./repo/activities";
import { generateReport } from "./repo/reports";
import { createStore, getStore, listStores, updateStore } from "./repo/stores";
import { placeholderPdf, seedIfEmpty } from "./seed/seed";
import { DEMO_USERS } from "./viewer";

const seller = DEMO_USERS.seller;
const buyer = DEMO_USERS.buyer;
let db: Db;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "diligence-test-"));
  process.env.LOCAL_DATA_DIR = dataDir;
  db = await createLocalDb();
  await seedIfEmpty(db);
});

afterAll(() => {
  delete process.env.LOCAL_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

const storeByName = async (name: string) => (await listStores(db, seller)).find((s) => s.name.includes(name))!;

describe("시드 데이터", () => {
  it("테스트 매물 6개를 만들고 모두 테스트 데이터로 표시한다", async () => {
    const stores = await listStores(db, seller);
    expect(stores).toHaveLength(6);
    expect(stores.every((s) => s.isTestData && s.name.startsWith("[테스트]"))).toBe(true);
  });

  it("분석 결과를 점포·분석 ID에 연결해 저장한다", async () => {
    const store = await storeByName("정상 매출");
    const summary = (await latestAnalysisSummaries(db, [store.id])).get(store.id)!;
    expect(summary.avgRevenue).toBe(30_000_000);
    expect(summary.avgOperatingProfit).toBe(10_950_000);
    expect(summary.paybackMonths).toBe(8.4);
    expect(summary.hasReport).toBe(true);
    const bundle = await getAnalysisBundle(db, buyer, summary.analysisId);
    expect(bundle.revenueChecks.length).toBeGreaterThan(0);
    expect(bundle.profits.find((p) => p.periodType === "average")?.missingCostCategories).toEqual(["advertising"]);
  });
});

describe("권한", () => {
  it("양수인은 매물을 수정하거나 자료를 올릴 수 없다", async () => {
    const store = await storeByName("정상 매출");
    await expect(updateStore(db, buyer, store.id, { premium: 0 })).rejects.toThrow(/소유자/);
    await expect(
      uploadDocument(db, buyer, { storeId: store.id, documentType: "pos_sales", fileName: "a.pdf", bytes: placeholderPdf(["x"]) }),
    ).rejects.toThrow(/소유자/);
  });

  it("양수인은 비공개 매물을 볼 수 없다", async () => {
    const own = await createStore(db, seller, {
      name: "비공개 매물", industry: "카페", address: "서울특별시 종로구 1", businessPeriodMonths: null,
      deposit: 0, monthlyRent: 0, premium: 0, claimedMonthlyRevenue: null, claimedMonthlyNetProfit: null,
      facilityInvestment: null, otherInitialCost: null, description: "", isPublished: false,
    });
    expect(own.region).toBe("서울 종로구");
    await expect(getStore(db, buyer, own.id)).rejects.toThrow(/찾을 수 없습니다/);
  });
});

describe("업로드 검증과 자료 이력", () => {
  it("확장자와 내용이 다른 파일을 거부한다", async () => {
    const store = await storeByName("정상 매출");
    await expect(
      uploadDocument(db, seller, { storeId: store.id, documentType: "pos_sales", fileName: "pos.png", bytes: placeholderPdf(["x"]) }),
    ).rejects.toThrow(/PDF, XLS/);
  });

  it("같은 내용의 파일을 다시 올리면 중복 가능성을 표시하고, 재업로드는 이전 문서를 대체한다", async () => {
    const store = await storeByName("정상 매출");
    const bytes = placeholderPdf(["duplicate check"]);
    const first = await uploadDocument(db, seller, { storeId: store.id, documentType: "other", fileName: "기타.pdf", bytes });
    const second = await uploadDocument(db, seller, { storeId: store.id, documentType: "other", fileName: "기타2.pdf", bytes });
    expect(second.duplicateOf).toEqual([first.document.id]);
    const third = await uploadDocument(db, seller, {
      storeId: store.id, documentType: "other", fileName: "기타_수정본.pdf", bytes: placeholderPdf(["v2"]), replacesDocumentId: first.document.id,
    });
    const docs = await listDocuments(db, [store.id], { documentType: "other" });
    expect(docs.find((d) => d.id === first.document.id)?.replacedById).toBe(third.document.id);
    expect(docs.find((d) => d.id === second.document.id)?.duplicateOfIds).toEqual([first.document.id]);
    const acts = await listActivities(db, { storeIds: [store.id], limit: 5 });
    expect(acts[0].type).toBe("document_reuploaded");
  });
});

describe("증빙 부족 매물에 자료를 추가하는 흐름", () => {
  it("체크리스트가 미제출 항목과 막힌 분석을 보여준다", async () => {
    const store = await storeByName("증빙 부족");
    const checklist = await getChecklist(db, store);
    const pos = checklist.items.find((i) => i.key === "pos_sales")!;
    expect(pos.state).toBe("missing");
    expect(pos.blockedAnalyses).toContain("양도인 주장 매출 검증");
    expect(checklist.items.find((i) => i.key === "lease_contract")?.state).toBe("complete");
    expect((await listRequests(db, [store.id]))[0].status).toBe("open");
  });

  it("POS·비용 자료를 올리고 샘플 분석 모듈로 분석하면 요청이 완료되고 재분석 결과가 바뀐다", async () => {
    const store = await storeByName("증빙 부족");
    const { fulfillRequests } = await import("./repo/diligence");
    for (const type of ["pos_sales", "expense"] as const) {
      const { document } = await uploadDocument(db, seller, { storeId: store.id, documentType: type, fileName: `${type}.pdf`, bytes: placeholderPdf([type]) });
      const res = await analyzeDocument(db, seller, document.id);
      expect(res.normalizedDataId).not.toBeNull();
    }
    await fulfillRequests(db, store);
    expect((await listRequests(db, [store.id]))[0].status).toBe("fulfilled");

    const bundle = await createAndRunFullAnalysis(db, seller, store.id);
    const claimed = bundle.revenueChecks.find((c) => c.checkType === "claimed_vs_evidence")!;
    expect(claimed.status).toBe("verified");
    const avg = bundle.profits.find((p) => p.periodType === "average")!;
    expect(avg.operatingProfit).not.toBeNull();

    const summary = (await latestAnalysisSummaries(db, [store.id])).get(store.id);
    const progress = await computeProgress(db, (await getStore(db, seller, store.id)), summary);
    expect(progress.checklist.items.find((i) => i.key === "pos_sales")?.state).toBe("complete");
    expect(progress.analysisOutdated).toBe(false);
  });

  it("형식이 잘못된 분석 결과는 원본만 보존하고 문서를 실패로 표시한다", async () => {
    const store = await storeByName("증빙 부족");
    const { document } = await uploadDocument(db, seller, { storeId: store.id, documentType: "card_sales", fileName: "card.pdf", bytes: placeholderPdf(["bad"]) });
    await expect(
      importExtraction(db, seller, { storeId: store.id, documentId: document.id, raw: { schema_version: "9.0" } }),
    ).rejects.toThrow(/지원하지 않는 schema_version/);
    const raw = await db.query<{ raw_payload: unknown }>(`select raw_payload from extracted_data where document_id = $1`, [document.id]);
    expect(raw[0].raw_payload).toEqual({ schema_version: "9.0" });
    const docs = await listDocuments(db, [store.id], { status: "failed" });
    expect(docs.map((d) => d.id)).toContain(document.id);
  });
});

describe("보고서와 상담", () => {
  it("보고서를 만들고 활동 기록을 남긴다", async () => {
    const store = await storeByName("손실 발생");
    const summary = (await latestAnalysisSummaries(db, [store.id])).get(store.id)!;
    const report = await generateReport(db, seller, summary.analysisId);
    const content = report.content as { risks: Array<{ level: string }>; premium: { paybackStatus: string } };
    expect(content.premium.paybackStatus).toBe("not_recoverable");
    expect(content.risks[0].level).toBe("CRITICAL");
    const acts = await listActivities(db, { storeIds: [store.id], limit: 1 });
    expect(acts[0].type).toBe("report_generated");
  });

  it("상담 답변은 저장된 분석 결과를 근거로 한다", async () => {
    const store = await storeByName("정상 매출");
    const summary = (await latestAnalysisSummaries(db, [store.id])).get(store.id)!;
    const msgs = await askQuestion(db, buyer, summary.analysisId, "월 순수익이 실제로 얼마나 되나요?");
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].content).toContain("10,950,000원");
    expect(msgs[1].citedSources.length).toBeGreaterThan(0);
    const premium = await askQuestion(db, buyer, summary.analysisId, "권리금 5,000만 원은 부담스러운 수준인가요?");
    expect(premium[1].content).toContain("시장 거래 데이터가 없어");
  });
});
