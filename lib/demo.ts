import "server-only";

// "샘플 데이터로 시연하기" (PRD 11.1, 11.6): 가상 점포 3곳 + 양수인 조건을 만든다.
// 샘플 파일은 samples/ 폴더의 실제 파일을 Storage에 올린다. AI 분석 결과는 samples/extractions.json에
// 저장해 두고 재사용한다 (같은 파일을 매번 다시 분석하지 않게). 없는 파일만 AI로 분석한다.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_USERS } from "./demo-users";
import { analyzeDocument, createDocument, ensureReportDocument, VIRTUAL_KINDS_FILTER } from "./listings";
import { summarizeReport } from "./openai";
import { BUCKET, getSupabase } from "./supabase";
import { classifyCost } from "./costs";
import { ensureInputDocument, facilityEstimateKey, saveCosts, saveFacilities } from "./inputs";
import { estimateFacilities } from "./openai";
import type { AccessLevel, CostGroup, DocCategory, ExtractedDocument, FacilityEstimate, FacilityInput, LaborInput, Report, Summary } from "./types";
import { verify } from "./verify";

const SAMPLES_DIR = path.join(process.cwd(), "samples");
const CACHE_FILE = path.join(SAMPLES_DIR, "extractions.json");
const FACILITY_CACHE_FILE = path.join(SAMPLES_DIR, "facility-estimates.json");

type DemoDoc = { file: string; category: DocCategory; raw: AccessLevel; summary: AccessLevel };
// F08 양도인 입력 (월 비용·인력·시설 목록). 공개 등급은 같은 종류 파일 자료와 맞춘다 (기존 시연 흐름이 그대로 동작하게)
type DemoInputs = {
  costs?: { name: string; amount: number; group: CostGroup }[];
  labor?: LaborInput;
  costLevel?: AccessLevel;
  facilities?: Omit<FacilityInput, "estimate" | "estimate_key">[];
  facilityLevel?: AccessLevel;
};
type DemoListing = { seller: number; fields: Record<string, unknown>; docs: DemoDoc[]; report: AccessLevel; inputs?: DemoInputs };

const F = (name: string, brand_model: string | null, qty: number, year: number | null, price: number | null, claimed: number, extra: Partial<FacilityInput> = {}) => ({
  name,
  brand_model,
  qty,
  purchase_year: year,
  purchase_price: price,
  condition: "양호",
  ownership: "owned" as const,
  is_interior: false,
  has_receipt: price !== null,
  claimed_value: claimed,
  ...extra,
});

const LISTINGS: DemoListing[] = [
  {
    seller: 0,
    fields: {
      address: "서울 마포구 ○○로 12, 1층",
      building_name: "마포샘플빌딩",
      business_name: "샘플분식",
      business_type: "음식점",
      premium: 60_000_000,
      premium_breakdown: { business: 40_000_000, facility: 20_000_000, floor: null, basis: "최근 6개월 순수익 기준" },
      deposit: 30_000_000,
      monthly_rent: 2_500_000,
      claimed_monthly_sales: 35_000_000,
      claimed_monthly_profit: 8_000_000,
      claimed_monthly_cash_sales: 3_000_000,
      is_franchise: false,
      floor: 1,
      total_floors: 5,
      area_pyeong: 20,
      themes: ["급매"],
      parking: { building_total: 10, for_store: 1 },
    },
    docs: [
      { file: "1_카드매출_2026상반기.xlsx", category: "sales", raw: "L3", summary: "L1" },
      { file: "2_배달앱_정산내역.csv", category: "sales", raw: "L3", summary: "L1" },
      { file: "3_POS_월별리포트_캡처.png", category: "sales", raw: "L3", summary: "L2" },
      { file: "4_부가세신고_요약.pdf", category: "sales", raw: "L3", summary: "L1" },
      { file: "5_비용내역_2026상반기.xlsx", category: "cost", raw: "L3", summary: "L2" },
      { file: "6_임대차계약서_요약.pdf", category: "contract", raw: "L3", summary: "L1" },
    ],
    report: "L1",
    inputs: {
      facilityLevel: "L1",
      facilities: [
        F("업소용 냉장고 45박스", "업소용 4도어", 1, 2022, 3_200_000, 2_500_000),
        F("튀김기 2구", null, 1, 2023, 1_800_000, 1_500_000),
        F("가스 화구 6구", null, 1, 2021, 2_500_000, 2_000_000),
        F("떡볶이 조리대", null, 1, 2022, 1_200_000, 1_000_000),
        F("테이블·의자 20석", null, 1, 2021, 3_000_000, 2_000_000),
        F("인테리어", null, 1, 2021, null, 9_000_000, { is_interior: true }),
        F("정수기", null, 1, null, null, 2_000_000, { ownership: "rental" }),
      ],
    },
  },
  {
    seller: 1,
    fields: {
      address: "서울 성동구 ○○길 8, 1층",
      building_name: "성수샘플빌딩",
      business_name: "샘플카페",
      business_type: "카페",
      premium: 80_000_000,
      premium_breakdown: { business: 50_000_000, facility: 30_000_000, floor: null, basis: "2024년 인테리어·설비 시공비 반영" },
      deposit: 40_000_000,
      monthly_rent: 3_500_000,
      claimed_monthly_sales: 35_000_000,
      claimed_monthly_profit: 7_000_000,
      claimed_monthly_cash_sales: 2_000_000,
      maintenance_fee: 200_000,
      is_franchise: false,
      floor: 1,
      total_floors: 4,
      area_pyeong: 18,
      themes: [],
      parking: { building_total: 4, for_store: 0 },
    },
    docs: [
      { file: "B_샘플카페/1_카드매출_2026상반기.xlsx", category: "sales", raw: "L2", summary: "L0" },
      { file: "B_샘플카페/2_배달앱_정산내역.csv", category: "sales", raw: "L2", summary: "L0" },
      { file: "B_샘플카페/3_POS_월별매출_캡처.png", category: "sales", raw: "L2", summary: "L0" },
      { file: "B_샘플카페/4_비용내역_2026상반기.xlsx", category: "cost", raw: "L3", summary: "L1" },
      { file: "B_샘플카페/5_임대차계약서_요약.pdf", category: "contract", raw: "L3", summary: "L2" },
      { file: "B_샘플카페/6_시설목록.pdf", category: "facility", raw: "L0", summary: "L0" },
    ],
    inputs: {
      costLevel: "L1",
      costs: [
        { name: "원두·우유 등 재료비", amount: 9_700_000, group: "ingredients" },
        { name: "인건비", amount: 7_500_000, group: "labor" },
        { name: "공과금 (전기·가스·수도)", amount: 850_000, group: "utilities" },
        { name: "카드·배달앱 수수료", amount: 800_000, group: "other" },
        { name: "배달 광고비", amount: 300_000, group: "other" },
        { name: "회계기장료", amount: 110_000, group: "other" },
        { name: "화재보험", amount: 80_000, group: "other" },
        { name: "인터넷", amount: 50_000, group: "other" },
        { name: "해충방제", amount: 50_000, group: "other" },
      ],
      labor: { family: 1, staff: 2 },
      facilityLevel: "L0",
      facilities: [
        F("에스프레소 머신 2그룹", "라마르조코 리네아 PB 2그룹", 1, 2024, 18_000_000, 12_000_000),
        F("그라인더", "말코닉 E65S", 2, 2024, 6_000_000, 4_000_000),
        F("냉장 쇼케이스", null, 1, 2024, 3_500_000, 2_500_000),
        F("테이블·의자 24석", null, 1, 2024, 4_800_000, 3_000_000),
        F("인테리어 (2024년 시공)", null, 1, 2024, null, 7_000_000, { is_interior: true }),
        F("제빙기", null, 1, null, null, 1_500_000, { ownership: "rental" }),
      ],
    },
    report: "L0",
  },
  {
    seller: 2,
    fields: {
      address: "서울 영등포구 ○○로 30, 1층",
      building_name: "영등포샘플타워",
      business_name: "샘플국밥",
      business_type: "음식점",
      premium: 120_000_000,
      premium_breakdown: { business: 90_000_000, facility: null, floor: 30_000_000, basis: "역세권 바닥 권리 포함" },
      deposit: 50_000_000,
      monthly_rent: 4_000_000,
      claimed_monthly_sales: 50_000_000,
      claimed_monthly_profit: 12_000_000,
      is_franchise: false,
      floor: 1,
      total_floors: 10,
      area_pyeong: 35,
      themes: ["공식 매물"],
      parking: { building_total: 30, for_store: 2 },
    },
    docs: [
      { file: "C_샘플국밥/1_카드매출_2026상반기.xlsx", category: "sales", raw: "L3", summary: "L1" },
      { file: "C_샘플국밥/2_부가세신고_요약.pdf", category: "sales", raw: "L3", summary: "L1" },
      { file: "C_샘플국밥/3_임대차계약서_요약.pdf", category: "contract", raw: "L3", summary: "L3" },
    ],
    report: "L1",
  },
];

export const DEMO_BUYER_PROFILE = {
  budget_total: 150_000_000,
  regions: ["서울"],
  business_types: ["카페", "음식점"],
  target_monthly_profit: 5_000_000,
  weekly_hours: 40,
  experience: "외식업 아르바이트 2년, 창업 경험 없음",
  payback_months: 24,
  notes: "직원 2명 이하로 운영하고 싶어요 (샘플 조건)",
};

async function readCache(): Promise<Record<string, ExtractedDocument>> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

// 이전에 만든 샘플 매물만 지운다 (사용자가 만든 매물은 건드리지 않는다)
async function removeOldSamples() {
  const supabase = getSupabase();
  const sellerIds = DEMO_USERS.filter((u) => u.role === "seller").map((u) => u.id);
  const { data: old, error } = await supabase.from("deals").select("id").eq("is_sample", true).in("seller_id", sellerIds);
  if (error) throw error;
  const ids = (old ?? []).map((d) => d.id);
  if (ids.length === 0) return;
  const { data: docs } = await supabase.from("documents").select("storage_path").in("deal_id", ids).not("kind", "in", VIRTUAL_KINDS_FILTER);
  const paths = (docs ?? []).map((d) => d.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from("agent_tasks").delete().overlaps("listing_ids", ids);
  await supabase.from("comparison_reports").delete().overlaps("listing_ids", ids);
  const { error: delError } = await supabase.from("deals").delete().in("id", ids);
  if (delError) throw delError;
}

async function createListing(demo: DemoListing, cache: Record<string, ExtractedDocument>, newCache: Record<string, ExtractedDocument>) {
  const supabase = getSupabase();
  const sellerId = DEMO_USERS[demo.seller].id;
  const { data: listing, error } = await supabase
    .from("deals")
    .insert({ ...demo.fields, seller_id: sellerId, status: "published", stage: "documents", is_sample: true })
    .select("*")
    .single();
  if (error) throw error;

  const extractions: ExtractedDocument[] = [];
  for (const d of demo.docs) {
    const bytes = new Uint8Array(await readFile(path.join(SAMPLES_DIR, d.file)));
    const fileName = path.basename(d.file);
    const doc = await createDocument(listing.id, fileName, bytes, d.category, { access_level: d.raw, summary_access_level: d.summary });
    const analyzed = await analyzeDocument(doc, cache[d.file]);
    if (analyzed.extraction) {
      newCache[d.file] = analyzed.extraction;
      extractions.push(analyzed.extraction);
    }
  }

  // 교차 검증 리포트 (코드) + 요약 (AI, 실패하면 요약 없이)
  const extraction = { documents: extractions };
  const result = verify(extraction, listing.claimed_monthly_sales);
  let summary: Summary | null = null;
  try {
    summary = await summarizeReport({
      deal: {
        premium: listing.premium,
        deposit: listing.deposit,
        monthly_rent: listing.monthly_rent,
        claimed_monthly_sales: listing.claimed_monthly_sales,
        claimed_monthly_profit: listing.claimed_monthly_profit,
      },
      result,
    });
  } catch {
    summary = null;
  }
  const report: Report = { extraction, ...result, summary };
  const { error: reportError } = await supabase.from("reports").insert({ deal_id: listing.id, grade: report.grade, result: report });
  if (reportError) throw reportError;
  const reportDoc = await ensureReportDocument(listing.id);
  await supabase.from("documents").update({ access_level: demo.report, summary_access_level: demo.report }).eq("id", reportDoc.id);

  if (demo.inputs) await seedInputs(listing.id, demo.inputs);
  return { id: listing.id as string, name: demo.fields.business_name as string, seller: DEMO_USERS[demo.seller].short };
}

// ---- 샘플 양도인 입력 + 시설 AI 추정 (samples/facility-estimates.json에 저장해 재사용) ----

type FacilityCache = Record<string, FacilityEstimate>;
let facilityCache: FacilityCache | null = null;
let facilityCacheDirty = false;

async function readFacilityCache(): Promise<FacilityCache> {
  if (facilityCache) return facilityCache;
  try {
    facilityCache = JSON.parse(await readFile(FACILITY_CACHE_FILE, "utf8")) as FacilityCache;
  } catch {
    facilityCache = {};
  }
  return facilityCache;
}

async function seedInputs(listingId: string, inputs: DemoInputs) {
  if (inputs.costs) {
    await ensureInputDocument(listingId, "input_cost", inputs.costLevel ?? "L1");
    const costs = inputs.costs.map((c) => ({ ...c, kind: classifyCost(c.name), kind_source: "auto" as const }));
    await saveCosts(listingId, costs, inputs.labor ?? null);
  }
  if (inputs.facilities) {
    await ensureInputDocument(listingId, "input_facility", inputs.facilityLevel ?? "L1");
    const cache = await readFacilityCache();
    const items: FacilityInput[] = inputs.facilities.map((f) => {
      const key = facilityEstimateKey(f);
      return cache[key] ? { ...f, estimate: cache[key], estimate_key: key } : { ...f, estimate: null, estimate_key: "" };
    });
    const todo = items.map((f, i) => ({ f, i })).filter(({ f }) => !f.estimate_key && !f.is_interior && f.ownership === "owned");
    if (todo.length) {
      try {
        const results = await estimateFacilities(todo.map(({ f }) => ({ name: f.name, brand_model: f.brand_model, purchase_year: f.purchase_year, purchase_price: f.purchase_price, condition: f.condition })));
        for (const r of results) {
          const t = todo[r.index];
          if (!t || r.low === null || r.high === null) continue;
          const estimate = { low: r.low, high: r.high, basis: r.basis };
          const key = facilityEstimateKey(t.f);
          items[t.i] = { ...items[t.i], estimate, estimate_key: key };
          cache[key] = estimate;
          facilityCacheDirty = true;
        }
      } catch {
        // AI가 실패하면 그 시설은 "시세 미확인"으로 둔다
      }
    }
    await saveFacilities(listingId, items);
  }
}

export async function seedDemo() {
  await removeOldSamples();
  const cache = await readCache();
  const newCache: Record<string, ExtractedDocument> = {};
  const listings = await Promise.all(LISTINGS.map((l) => createListing(l, cache, newCache)));

  const buyerId = DEMO_USERS.find((u) => u.role === "buyer")!.id;
  const { error } = await getSupabase()
    .from("buyer_profiles")
    .upsert({ user_id: buyerId, ...DEMO_BUYER_PROFILE, updated_at: new Date().toISOString() });
  if (error) throw error;

  // 개발 환경에서 새로 분석한 파일이 있으면 캐시에 저장한다 (배포 환경은 파일을 쓸 수 없다)
  if (facilityCacheDirty && facilityCache && process.env.NODE_ENV === "development") {
    await writeFile(FACILITY_CACHE_FILE, JSON.stringify(facilityCache, null, 2) + "\n");
    facilityCacheDirty = false;
  }
  const added = Object.keys(newCache).filter((k) => !cache[k]);
  if (added.length > 0 && process.env.NODE_ENV === "development") {
    await writeFile(CACHE_FILE, JSON.stringify({ ...cache, ...newCache }, null, 2) + "\n");
  }
  return { listings, analyzed_now: added.length };
}
