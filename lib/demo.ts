import "server-only";

// "샘플 데이터로 시연하기" (PRD 11.1, 11.6): 가상 점포 3곳 + 양수인 조건을 만든다.
// 샘플 파일은 samples/ 폴더의 실제 파일을 Storage에 올린다. AI 분석 결과는 samples/extractions.json에
// 저장해 두고 재사용한다 (같은 파일을 매번 다시 분석하지 않게). 없는 파일만 AI로 분석한다.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_USERS } from "./demo-users";
import { analyzeDocument, createDocument, ensureReportDocument } from "./listings";
import { summarizeReport } from "./openai";
import { BUCKET, getSupabase } from "./supabase";
import type { AccessLevel, DocCategory, ExtractedDocument, Report, Summary } from "./types";
import { verify } from "./verify";

const SAMPLES_DIR = path.join(process.cwd(), "samples");
const CACHE_FILE = path.join(SAMPLES_DIR, "extractions.json");

type DemoDoc = { file: string; category: DocCategory; raw: AccessLevel; summary: AccessLevel };
type DemoListing = { seller: number; fields: Record<string, unknown>; docs: DemoDoc[]; report: AccessLevel };

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
  const { data: docs } = await supabase.from("documents").select("storage_path").in("deal_id", ids).neq("kind", "report");
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

  return { id: listing.id as string, name: demo.fields.business_name as string, seller: DEMO_USERS[demo.seller].short };
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
  const added = Object.keys(newCache).filter((k) => !cache[k]);
  if (added.length > 0 && process.env.NODE_ENV === "development") {
    await writeFile(CACHE_FILE, JSON.stringify({ ...cache, ...newCache }, null, 2) + "\n");
  }
  return { listings, analyzed_now: added.length };
}
