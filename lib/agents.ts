import "server-only";

// AI 에이전트 간 통신 (PRD F07, docs/API.md 10.4)
//
// 양수인 AI: 매물마다 "지금 볼 수 있는 자료"로 숫자를 계산해 빠진 주제를 찾고(코드) 질문을 만든다(AI, 실패하면 정해진 문구).
// 양도인 AI: 그 매물의 데이터만 찾는다. 권한 검사는 코드가 하고, 허용된 값만 AI에 넘긴다.
//   허용된 값 있음 → 근거와 함께 답 / 값은 있는데 권한 없음 → 승인 요청 또는 접근 거부 / 값 없음 → 추가 자료 요청
// 모든 질문·답은 agent_messages에 저장된다. 같은 양수인·매물·주제 질문은 다시 만들지 않는다(dedupe_key).
// 양수인이 대화창에서 직접 쓴 질문(question_type "custom:주제,...")도 같은 길로 답한다:
//   내 AI가 필요한 자료 범위를 고르고(AI + 키워드) → 양도인 AI가 그 범위의 허용된 값만으로 답한다. 자료로 답할 수 없으면 양도인에게 넘긴다.

import { audit } from "./audit";
import type { CurrentUser } from "./auth";
import { computeFacts, personalFit, recommend, type BuyerProfile } from "./facts";
import { won } from "./format";
import { HttpError } from "./http";
import { dataPointLabel, formatPointValue, TRUST_LABEL } from "./labels";
import { getListing } from "./listings";
import { answerAsSeller, classifyQuestion, generateQuestions } from "./openai";
import { getSupabase } from "./supabase";
import type { AccessLevel, DataPoint, Listing } from "./types";
import { getBuyerProfile, listingBasics, loadVisibleData, visibleFacts } from "./visible";

export const TOPICS = ["sales", "cost", "operation", "lease", "facility"] as const;
export type Topic = (typeof TOPICS)[number];

const TOPIC_MATCH: Record<Topic, (key: string) => boolean> = {
  sales: (k) => /^(card_sales|delivery_app|pos|vat_return)\./.test(k),
  cost: (k) => k.startsWith("cost."),
  operation: (k) => k.startsWith("operation."),
  lease: (k) => k.startsWith("lease."),
  facility: (k) => k === "facility.item",
};

// 직접 질문 범위: 자료 주제 + listing(공개된 매물 기본정보: 권리금·보증금·월세·위치·업종, L0)
// + seller(자료로 답할 수 없어 양도인 본인이 답해야 하는 부분: 양도 이유, 협상 등)
type AskTopic = Topic | "listing" | "seller";

// AI가 범위를 못 고를 때도 쓰고, AI 결과에 더해서도 쓴다 (빠뜨리지 않게)
const TOPIC_KEYWORDS: Record<AskTopic, RegExp> = {
  sales: /매출|판매|카드|배달|POS|포스|부가세|손님|객단가|주문/i,
  cost: /비용|재료|원가|인건비|임금|월급|급여|공과금|전기|가스|수도|지출|순수익|순이익|이익|마진|남(아|는)/,
  operation: /근무|운영\s*시간|영업\s*시간|직원|알바|아르바이트|인력|휴무|오픈|마감/,
  lease: /임대|계약|관리비|재계약|만료|건물주|임대인/,
  facility: /시설|설비|장비|인테리어|기기|냉장|주방|집기|인수인계/,
  listing: /권리금|보증금|월세|위치|주소|업종/,
  seller: /이유|왜|사정|협상|깎|조정|할인|계획|전망/,
};

function keywordTopics(text: string): AskTopic[] {
  return (Object.keys(TOPIC_KEYWORDS) as AskTopic[]).filter((t) => TOPIC_KEYWORDS[t].test(text));
}

function isCustom(m: Pick<AgentMessage, "question_type">) {
  return m.question_type.startsWith("custom");
}

// 질문이 다루는 범위. 자동 질문은 topic 하나, 직접 질문은 "custom:sales,cost"에 적힌 것들
function messageTopics(m: Pick<AgentMessage, "question_type" | "topic">): AskTopic[] {
  if (!isCustom(m)) return [m.topic];
  return m.question_type.slice("custom:".length).split(",").filter(Boolean) as AskTopic[];
}

const TEMPLATE_QUESTION: Record<Topic, string> = {
  sales: "최근 6개월 월별 매출(카드·배달·현금)을 알려주실 수 있나요?",
  cost: "최근 6개월 월평균 재료비·인건비·공과금 등 운영비를 알려주실 수 있나요?",
  operation: "점주님의 주당 근무시간과 직원 수를 알려주실 수 있나요?",
  lease: "임대차 계약 만료일과 관리비, 재계약 조건을 알려주실 수 있나요?",
  facility: "인수 때 넘겨받는 시설·설비 목록을 알려주실 수 있나요?",
};

export type AgentMessage = {
  id: string;
  created_at: string;
  updated_at: string;
  task_id: string | null;
  listing_id: string;
  buyer_id: string;
  question_type: string; // 자동 질문은 주제 이름, 직접 질문은 "custom:주제,..."
  topic: Topic;
  question: string;
  status: string;
  answer_type: string | null;
  answer: string | null;
  evidence: Evidence[];
  grant_id: string | null;
  ai_used: boolean;
  error: string | null;
};

export type Evidence = { item: string; period: string | null; value: string; trust: string; source: string };

const MAX_LISTINGS = 3;

async function buyerUser(buyerId: string): Promise<CurrentUser> {
  const { data, error } = await getSupabase().from("users").select("id, name, roles").eq("id", buyerId).single();
  if (error) throw error;
  return data as CurrentUser;
}

function profileForAi(p: BuyerProfile | null) {
  if (!p) return { note: "인수 조건 없음" };
  return {
    총예산: p.budget_total ? won(p.budget_total) : "미입력",
    목표_월순수익: p.target_monthly_profit ? won(p.target_monthly_profit) : "미입력",
    주당_근무가능시간: p.weekly_hours ?? "미입력",
    선호업종: p.business_types,
    경험: p.experience ?? "미입력",
  };
}

// ---- 1. 양수인 AI: 매물별 빠진 주제 → 질문 ----

async function createQuestions(user: CurrentUser, profile: BuyerProfile | null, listing: Listing, taskId: string): Promise<AgentMessage[]> {
  const supabase = getSupabase();
  const { facts } = await visibleFacts(user, listing);
  const missing: { topic: Topic; reason: string }[] = [];
  if (facts.monthly_sales_avg.value === null) missing.push({ topic: "sales", reason: facts.monthly_sales_avg.basis });
  if (facts.monthly_cost_avg.value === null) missing.push({ topic: "cost", reason: facts.monthly_cost_avg.basis });
  if (facts.owner_weekly_hours.value === null) missing.push({ topic: "operation", reason: facts.owner_weekly_hours.basis });
  if (facts.lease_end.value === null) missing.push({ topic: "lease", reason: facts.lease_end.basis });
  if (facts.facility_items.length === 0) missing.push({ topic: "facility", reason: "시설 목록을 볼 수 없어요" });

  // 이미 진행 중이거나 답을 받은 주제는 다시 묻지 않는다
  const { data: existing, error } = await supabase.from("agent_messages").select("*").eq("buyer_id", user.id).eq("listing_id", listing.id);
  if (error) throw error;
  // 직접 질문은 주제별 자동 질문을 대신하지 않는다
  const existingByTopic = new Map((existing as AgentMessage[]).filter((m) => !isCustom(m)).map((m) => [m.topic, m]));
  const toAsk = missing.filter((m) => !existingByTopic.has(m.topic));

  let texts: Map<string, string> = new Map();
  let aiUsed = false;
  if (toAsk.length > 0) {
    try {
      const qs = await generateQuestions({ buyer: profileForAi(profile), listing: { 지역: facts.listing.area, 업종: facts.listing.business_type }, missing: toAsk });
      texts = new Map(qs.filter((q) => toAsk.some((m) => m.topic === q.topic)).map((q) => [q.topic, q.question.slice(0, 300)]));
      aiUsed = true;
    } catch {
      aiUsed = false; // 정해진 문구로 대신한다
    }
  }

  const rows = toAsk.map((m) => ({
    task_id: taskId,
    listing_id: listing.id,
    buyer_id: user.id,
    question_type: m.topic,
    topic: m.topic,
    question: texts.get(m.topic) ?? TEMPLATE_QUESTION[m.topic],
    status: "queued",
    ai_used: aiUsed && texts.has(m.topic),
    dedupe_key: `${user.id}|${listing.id}|${m.topic}`,
  }));
  let created: AgentMessage[] = [];
  if (rows.length > 0) {
    const { data, error: insertError } = await supabase.from("agent_messages").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("*");
    if (insertError) throw insertError;
    created = data as AgentMessage[];
  }
  // 예전에 접근 거부·자료 없음·오류로 끝난 질문은 이번 실사에 다시 붙여서 다시 묻는다
  const retry = (existing as AgentMessage[]).filter((m) => ["denied", "no_data", "needs_documents"].includes(m.answer_type ?? "") || (m.status === "error" && m.question_type !== "custom"));
  if (retry.length > 0) {
    await supabase.from("agent_messages").update({ task_id: taskId, status: "queued" }).in("id", retry.map((m) => m.id));
  }
  return [...created, ...retry];
}

// ---- 2. 양도인 AI: 그 매물 데이터만, 허용된 값만 ----

export async function answerQuestion(messageId: string): Promise<AgentMessage> {
  const supabase = getSupabase();
  const { data: msg, error } = await supabase.from("agent_messages").select("*").eq("id", messageId).single();
  if (error) throw error;
  const m = msg as AgentMessage;
  await supabase.from("agent_messages").update({ status: "answering", updated_at: new Date().toISOString() }).eq("id", m.id);

  try {
    const listing = await getListing(m.listing_id);
    const buyer = await buyerUser(m.buyer_id);
    const visible = await loadVisibleData(buyer, listing); // 양수인 권한으로 본 것만
    const topics = messageTopics(m);
    const dataTopics = topics.filter((t): t is Topic => t in TOPIC_MATCH);
    const match = (key: string) => dataTopics.some((t) => TOPIC_MATCH[t](key));
    const allowed = visible.data_points.filter((p) => match(p.key));
    const now = new Date().toISOString();

    // 직접 질문인데 매물 자료로 답할 수 있는 범위가 없으면(양도 이유 등) 양도인에게 직접 넘긴다
    const askSeller = topics.includes("seller");
    const sellerNote = " 질문 중 매물 자료로 확인할 수 없는 부분은 추측하지 않고 양도인에게 전달했어요.";
    if (topics.every((t) => t === "seller")) {
      const { data: saved, error: saveError } = await supabase
        .from("agent_messages")
        .update({
          status: "needs_documents",
          answer_type: "needs_seller",
          answer: "매물 자료로 답할 수 있는 질문이 아니라서 추측하지 않고 양도인에게 직접 전달했어요. 양도인이 답하면 여기에 보여요.",
          evidence: [],
          error: null,
          updated_at: now,
        })
        .eq("id", m.id)
        .select("*")
        .single();
      if (saveError) throw saveError;
      return saved as AgentMessage;
    }
    // 공개된 매물 기본정보(L0)는 누구나 볼 수 있으니 직접 질문의 근거로 쓴다
    const publicInfo: Evidence[] = topics.includes("listing")
      ? [
          { item: "희망 권리금", period: null, value: won(listing.premium), trust: "매물 정보", source: "매물 정보 (공개)" },
          { item: "보증금", period: null, value: won(listing.deposit), trust: "매물 정보", source: "매물 정보 (공개)" },
          { item: "월세", period: null, value: won(listing.monthly_rent), trust: "매물 정보", source: "매물 정보 (공개)" },
          { item: "위치·업종", period: null, value: `${listingBasics(listing, false).area} · ${listing.business_type}`, trust: "매물 정보", source: "매물 정보 (공개)" },
        ]
      : [];

    // 권한과 관계없이 이 매물에 이 주제 자료가 있는지 (값은 AI에 넘기지 않고, 등급만 본다)
    const { data: all, error: allError } = await supabase.from("data_points").select("id, key, document_id, access_level").eq("listing_id", listing.id);
    if (allError) throw allError;
    const topicAll = (all as Pick<DataPoint, "id" | "key" | "document_id" | "access_level">[]).filter((p) => match(p.key));
    const allowedIds = new Set(allowed.map((p) => p.id));
    const restricted = topicAll.filter((p) => !allowedIds.has(p.id));

    let update: Partial<AgentMessage> & { updated_at: string };

    if (allowed.length > 0 || publicInfo.length > 0) {
      const docName = new Map(visible.files.map((d) => [d.id, d.file_name]));
      // 화면에 붙일 근거: 허용된 값 전부 (최대 60개)
      const evidence: Evidence[] = [...publicInfo, ...allowed.slice(0, 60).map((p) => ({
        item: dataPointLabel(p.key),
        period: p.period,
        value: formatPointValue(p),
        trust: TRUST_LABEL[p.trust_level],
        source: (p.document_id && docName.get(p.document_id)) || p.source_note || "자료",
      }))];
      const computed = Object.assign({}, ...dataTopics.map((t) => computedSummary(t, listing, allowed))) as Record<string, string>;
      const dataEvidence = evidence.slice(publicInfo.length);
      let answer: string;
      let aiUsed = true;
      try {
        answer = await answerAsSeller({ question: m.question, allowed_data: [...publicInfo, ...groupEvidence(dataEvidence, allowed)], computed });
      } catch {
        aiUsed = false;
        const lines = [...publicInfo.map((e) => [e.item, e.value]), ...Object.entries(computed)];
        answer = lines.map(([k, v]) => `${k}: ${v}`).join(" / ") || "허용된 자료를 근거로 첨부했어요.";
      }
      if (restricted.length > 0) answer += " (일부 자료는 공개 범위 밖이라 답에 넣지 않았어요.)";
      if (askSeller) answer += sellerNote;
      update = { status: "answered", answer_type: "auto", answer, evidence, ai_used: aiUsed, error: null, updated_at: now };
    } else if (restricted.length > 0) {
      update = await restrictedAnswer(m, listing, restricted, visible.access.ndaAgreed, now);
      if (askSeller) update.answer += sellerNote;
    } else {
      update = {
        status: "needs_documents",
        answer_type: "needs_documents",
        answer: isCustom(m)
          ? "데이터룸에 이 질문에 답할 자료가 없어요. 추측하지 않고 양도인에게 자료 추가와 답변을 요청했어요."
          : "데이터룸에 이 주제의 자료가 없어요. 양도인에게 자료 추가를 요청했어요.",
        evidence: [],
        error: null,
        updated_at: now,
      };
    }

    const { data: saved, error: saveError } = await supabase.from("agent_messages").update(update).eq("id", m.id).select("*").single();
    if (saveError) throw saveError;
    await audit(listing.seller_id ?? m.buyer_id, "agent_answer", listing.id, `${m.topic}: ${update.answer_type}`);
    return saved as AgentMessage;
  } catch (e) {
    console.error("[answerQuestion]", e);
    const { data } = await supabase
      .from("agent_messages")
      .update({ status: "error", error: e instanceof Error ? e.message : "알 수 없는 오류", updated_at: new Date().toISOString() })
      .eq("id", m.id)
      .select("*")
      .single();
    return data as AgentMessage;
  }
}

// 값은 있는데 이 양수인이 볼 수 없을 때: L2면 승인 요청, NDA가 없으면 NDA 안내, L3만 있으면 접근 거부
async function restrictedAnswer(
  m: AgentMessage,
  listing: Listing,
  restricted: Pick<DataPoint, "document_id" | "access_level">[],
  ndaAgreed: boolean,
  now: string,
): Promise<Partial<AgentMessage> & { updated_at: string }> {
  const levels = new Set<AccessLevel>(restricted.map((p) => p.access_level));
  const openable = restricted.filter((p) => p.access_level === "L1" || p.access_level === "L2");
  if (openable.length === 0) {
    return { status: "answered", answer_type: "denied", answer: "양도인이 이 정보를 비공개(L3)로 설정해서 답할 수 없어요.", evidence: [], updated_at: now };
  }
  if (!ndaAgreed) {
    return {
      status: "answered",
      answer_type: "denied",
      answer: `이 정보는 NDA 테스트 동의 후에 볼 수 있어요${levels.has("L2") ? " (일부는 동의 뒤 양도인 승인도 필요해요)" : ""}. 동의하면 자동으로 다시 물어요.`,
      evidence: [],
      updated_at: now,
    };
  }
  // NDA는 했고 L2 자료가 남은 경우: 자료마다 열람 요청을 만든다 (이미 있으면 그대로)
  const docIds = [...new Set(restricted.filter((p) => p.access_level === "L2" && p.document_id).map((p) => p.document_id!))];
  const supabase = getSupabase();
  let grantId: string | null = null;
  let blocked = 0; // 양도인이 거절·회수한 자료는 AI가 다시 요청하지 않는다 (양수인이 직접 다시 요청할 수는 있다)
  for (const docId of docIds) {
    const { data: existing } = await supabase
      .from("access_grants")
      .select("id, status")
      .eq("listing_id", listing.id)
      .eq("buyer_id", m.buyer_id)
      .eq("target_type", "document_summary")
      .eq("target_id", docId)
      .maybeSingle();
    if (existing && (existing.status === "requested" || existing.status === "approved")) {
      grantId ??= existing.id;
      continue;
    }
    if (existing && (existing.status === "rejected" || existing.status === "revoked")) {
      blocked++;
      continue;
    }
    const { data: g, error } = await supabase
      .from("access_grants")
      .upsert(
        { listing_id: listing.id, buyer_id: m.buyer_id, target_type: "document_summary", target_id: docId, status: "requested", reason: `양수인 AI 질문: ${m.question}`.slice(0, 300), decided_at: null, expires_at: null },
        { onConflict: "listing_id,buyer_id,target_type,target_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    grantId ??= g.id;
    await audit(m.buyer_id, "grant_request", listing.id, `양수인 AI가 자료 열람 요청 (${m.topic})`);
  }
  if (!grantId && blocked > 0) {
    return { status: "rejected", answer_type: "denied", answer: "양도인이 이 자료의 열람 요청을 거절했거나 권한을 회수했어요.", evidence: [], updated_at: now };
  }
  return {
    status: "pending_approval",
    answer_type: "needs_approval",
    answer: "양도인 승인이 필요한 자료예요. 양도인에게 승인 요청을 보냈어요. 승인되면 자동으로 다시 답해요.",
    evidence: [],
    grant_id: grantId,
    updated_at: now,
  };
}

// AI에는 값을 항목별로 묶어서 준다 (기간, 개수, 월평균). 잘린 목록 때문에 "자료가 일부만 있다"고 착각하지 않게.
function groupEvidence(evidence: Evidence[], points: DataPoint[]) {
  const groups = new Map<string, { item: string; periods: string[]; values: number[]; text: string[]; trust: string; source: string }>();
  points.forEach((p, i) => {
    const e = evidence[i] ?? { item: dataPointLabel(p.key), value: formatPointValue(p), trust: TRUST_LABEL[p.trust_level], source: p.source_note ?? "자료", period: p.period };
    const key = `${e.item}|${e.source}`;
    const g = groups.get(key) ?? { item: e.item, periods: [], values: [], text: [], trust: e.trust, source: e.source };
    if (p.period) g.periods.push(p.period);
    if (p.value !== null && p.unit === "KRW") g.values.push(Number(p.value));
    else g.text.push(e.value);
    groups.set(key, g);
  });
  return [...groups.values()].map((g) => {
    const periods = [...new Set(g.periods)].sort();
    const value = g.values.length
      ? g.values.length === 1
        ? won(g.values[0])
        : `${g.values.length}개 값, 평균 ${won(g.values.reduce((a, b) => a + b, 0) / g.values.length)}`
      : g.text.join(", ");
    return {
      item: g.item,
      period: periods.length > 1 ? `${periods[0]}~${periods[periods.length - 1]} (${periods.length}개월)` : (periods[0] ?? null),
      value,
      trust: g.trust,
      source: g.source,
    };
  });
}

// 허용된 값으로 코드가 먼저 계산한 요약 (AI 답의 재료이자, AI가 실패했을 때의 답)
function computedSummary(topic: Topic, listing: Listing, allowed: DataPoint[]): Record<string, string> {
  const f = computeFacts(listingBasics(listing, false), allowed, null);
  const out: Record<string, string> = {};
  if (topic === "sales" && f.monthly_sales_avg.value !== null) {
    out["월평균 매출"] = `${won(f.monthly_sales_avg.value)} (${f.monthly_sales_avg.basis})`;
    if (f.sales_volatility.value !== null) out["매출 변동계수"] = `${f.sales_volatility.value}%`;
  }
  if (topic === "cost" && f.monthly_cost_avg.value !== null) out["월평균 비용 (비용 내역 기준, 관리비 제외)"] = `${won(f.monthly_cost_avg.value)} (${f.monthly_cost_avg.basis})`;
  if (topic === "operation") {
    if (f.owner_weekly_hours.value !== null) out["점주 근무시간"] = `주 ${f.owner_weekly_hours.value}시간`;
    if (f.staff_count.value !== null) out["직원 수"] = `${f.staff_count.value}명`;
  }
  if (topic === "lease") {
    if (f.lease_end.value) out["임대차 만료"] = `${f.lease_end.value} (남은 기간 ${f.lease_remaining_months.value}개월)`;
    if (f.maintenance_fee.value !== null) out["관리비"] = won(f.maintenance_fee.value);
  }
  if (topic === "facility" && f.facility_items.length) out["넘겨받는 시설"] = f.facility_items.join(", ");
  return out;
}

// ---- 3. 실사 시작: 매물 최대 3개에 동시에 ----
// 화면에서 대화가 오가는 과정을 볼 수 있게, 라우트는 실사만 만들고 바로 응답한다.
// 질문 만들기·답하기는 돌려받은 runner를 라우트가 after()로 응답 뒤에 실행한다. 화면은 몇 초마다 새로 불러온다.

type Runner = () => Promise<void>;

async function checkListings(user: CurrentUser, listingIds: string[]) {
  if (!user.roles.includes("buyer")) throw new HttpError(403, "양수인만 AI 실사를 시작할 수 있어요.");
  const ids = [...new Set(listingIds)].slice(0, MAX_LISTINGS + 1);
  if (ids.length === 0) throw new HttpError(400, "실사할 매물을 1개 이상 골라주세요.");
  if (ids.length > MAX_LISTINGS) throw new HttpError(400, `매물은 최대 ${MAX_LISTINGS}개까지 고를 수 있어요.`);
  const listings = await Promise.all(ids.map(getListing));
  for (const l of listings) {
    if (l.status !== "published") throw new HttpError(404, "공개되지 않은 매물이 있어요.");
    if (l.seller_id === user.id) throw new HttpError(400, "내 매물은 실사할 수 없어요.");
  }
  return listings;
}

// 매물끼리는 동시에, 한 매물 안의 질문은 차례대로. 끝나면 실사 상태를 done(실패하면 error)으로 바꾼다.
function taskRunner(user: CurrentUser, listings: Listing[], taskId: string): Runner {
  return async () => {
    const supabase = getSupabase();
    let status = "done";
    try {
      const profile = await getBuyerProfile(user.id);
      await Promise.all(
        listings.map(async (l) => {
          const questions = await createQuestions(user, profile, l, taskId);
          for (const q of questions) await answerQuestion(q.id);
        }),
      );
    } catch (e) {
      console.error("[taskRunner]", e);
      status = "error";
    }
    await supabase.from("agent_tasks").update({ status }).eq("id", taskId);
  };
}

export async function startTask(user: CurrentUser, listingIds: string[]): Promise<{ taskId: string; run: Runner }> {
  const listings = await checkListings(user, listingIds);
  const { data: task, error } = await getSupabase()
    .from("agent_tasks")
    .insert({ buyer_id: user.id, listing_ids: listings.map((l) => l.id), status: "running" })
    .select("*")
    .single();
  if (error) throw error;
  return { taskId: task.id as string, run: taskRunner(user, listings, task.id) };
}

// 인수 조건 기준 추천 점수 상위 매물(최대 3개)을 고른다. 예산을 넘는 매물은 뺀다. 맞는 매물이 없으면 빈 배열.
export async function pickRecommended(user: CurrentUser): Promise<string[]> {
  const { data, error } = await getSupabase().from("deals").select("*").eq("status", "published").not("seller_id", "is", null).neq("seller_id", user.id).limit(100);
  if (error) throw error;
  const profile = await getBuyerProfile(user.id);
  const scored = await Promise.all(
    ((data ?? []) as Listing[]).map(async (l) => {
      const { facts } = await visibleFacts(user, l);
      const fit = personalFit(facts, profile);
      return { id: l.id, fit, total: recommend(facts, fit, profile).total };
    }),
  );
  return scored
    .filter((s) => s.fit.within_budget !== false)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_LISTINGS)
    .map((s) => s.id);
}

// 실사 안에서 아직 끝나지 않은 질문(거부·자료 없음·오류)을 다시 묻는다. NDA 동의나 자료 추가 뒤에 쓴다.
export async function rerunTask(user: CurrentUser, taskId: string): Promise<Runner> {
  const supabase = getSupabase();
  const { data: task, error } = await supabase.from("agent_tasks").select("*").eq("id", taskId).maybeSingle();
  if (error) throw error;
  if (!task || task.buyer_id !== user.id) throw new HttpError(404, "실사를 찾을 수 없어요.");
  if (task.status === "running") throw new HttpError(409, "실사가 아직 진행 중이에요. 끝난 뒤에 다시 물어봐 주세요.");
  const listings = await Promise.all((task.listing_ids as string[]).map(getListing));
  await supabase.from("agent_tasks").update({ status: "running" }).eq("id", taskId);
  return taskRunner(user, listings, taskId);
}

// 질문들을 "전달 대기"로 되돌려 놓고(화면에 바로 보이게), 응답 뒤에 차례로 다시 답하는 runner를 돌려준다.
async function queueAnswers(ids: string[]): Promise<Runner> {
  if (ids.length > 0) {
    const { error } = await getSupabase()
      .from("agent_messages")
      .update({ status: "queued", answer_type: null, answer: null, evidence: [], error: null, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;
  }
  return async () => {
    for (const id of ids) await answerQuestion(id);
  };
}

// 양도인이 열람 요청을 승인·거절·회수했을 때: 그 양수인·매물의 질문을 지금 권한으로 다시 처리한다.
// 거절·회수는 바로 처리하고(권한이 줄어든 건 늦추지 않는다), 승인 뒤 재응답은 runner로 돌려준다.
export async function onGrantDecided(grant: { listing_id: string; buyer_id: string; status: string }): Promise<Runner | null> {
  const supabase = getSupabase();
  if (grant.status === "revoked") {
    await reanswerAfterAccessLoss(grant.listing_id, grant.buyer_id);
    return null;
  }
  const { data, error } = await supabase
    .from("agent_messages")
    .select("id")
    .eq("listing_id", grant.listing_id)
    .eq("buyer_id", grant.buyer_id)
    .eq("status", "pending_approval");
  if (error) throw error;
  const ids = (data ?? []).map((m) => m.id as string);
  if (grant.status === "approved") return queueAnswers(ids);
  if (grant.status === "rejected" && ids.length > 0) {
    await supabase
      .from("agent_messages")
      .update({ status: "rejected", answer_type: "denied", answer: "양도인이 열람 요청을 거절했어요.", updated_at: new Date().toISOString() })
      .in("id", ids);
  }
  return null;
}

// NDA 테스트 동의 뒤: "NDA가 필요하다"며 거부됐던 질문을 별도 요청 없이 다시 묻는다.
export async function onNdaAgreed(listingId: string, buyerId: string): Promise<Runner> {
  const { data, error } = await getSupabase()
    .from("agent_messages")
    .select("id, answer")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .eq("status", "answered")
    .eq("answer_type", "denied");
  if (error) throw error;
  return queueAnswers((data ?? []).filter((m) => (m.answer ?? "").includes("NDA")).map((m) => m.id as string));
}

// 양도인이 자료를 추가했을 때: 이 매물에서 "추가 자료 필요"로 멈춘 질문을 모든 양수인에 대해 다시 답한다.
export async function onDocumentAdded(listingId: string): Promise<Runner> {
  const { data, error } = await getSupabase()
    .from("agent_messages")
    .select("id")
    .eq("listing_id", listingId)
    .eq("status", "needs_documents")
    .eq("answer_type", "needs_documents"); // 자료로 답할 수 없는 직접 질문(needs_seller)은 양도인 답을 기다린다
  if (error) throw error;
  return queueAnswers((data ?? []).map((m) => m.id as string));
}

// 양수인이 대화창에서 직접 질문한다. 질문은 바로 저장해서 화면에 보이고(status created),
// 응답 뒤에 내 AI가 필요한 자료 범위를 확인하고(AI + 키워드) 양도인 AI가 답한다.
export async function askQuestion(user: CurrentUser, taskId: string, listingId: string, text: string): Promise<{ message: AgentMessage; run: Runner }> {
  const supabase = getSupabase();
  const { data: task, error } = await supabase.from("agent_tasks").select("*").eq("id", taskId).maybeSingle();
  if (error) throw error;
  if (!task || task.buyer_id !== user.id) throw new HttpError(404, "실사를 찾을 수 없어요.");
  if (!(task.listing_ids as string[]).includes(listingId)) throw new HttpError(400, "이 실사에 들어 있는 매물이 아니에요.");
  const question = text.trim().replace(/\s+/g, " ");
  if (question.length < 2) throw new HttpError(400, "질문을 입력해주세요.");
  if (question.length > 300) throw new HttpError(400, "질문은 300자까지 쓸 수 있어요.");

  const { data: saved, error: insertError } = await supabase
    .from("agent_messages")
    .insert({
      task_id: taskId,
      listing_id: listingId,
      buyer_id: user.id,
      question_type: "custom",
      topic: "sales", // 범위를 확인한 뒤 바꾼다
      question,
      status: "created",
      dedupe_key: `${user.id}|${listingId}|custom|${crypto.randomUUID()}`,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  const message = saved as AgentMessage;

  const run: Runner = async () => {
    let topics = keywordTopics(question);
    let aiUsed = false;
    try {
      const ai = (await classifyQuestion(question)).filter((t): t is AskTopic => t in TOPIC_KEYWORDS);
      topics = [...new Set([...ai, ...topics])];
      aiUsed = true;
    } catch {
      // 키워드로 고른 범위만 쓴다
    }
    const first = topics.find((t): t is Topic => t in TOPIC_MATCH) ?? "sales";
    await supabase
      .from("agent_messages")
      .update({ question_type: `custom:${topics.join(",")}`, topic: first, status: "queued", ai_used: aiUsed, updated_at: new Date().toISOString() })
      .eq("id", message.id);
    await answerQuestion(message.id);
  };
  return { message, run };
}

// 양도인이 질문에 직접 글로 답한다. 숫자로 확인된 값이 아니라 "점주 진술"이라 비교표 숫자는 바꾸지 않는다.
export async function sellerReply(user: CurrentUser, messageId: string, text: string): Promise<AgentMessage> {
  const supabase = getSupabase();
  const { data: msg, error } = await supabase.from("agent_messages").select("*").eq("id", messageId).maybeSingle();
  if (error) throw error;
  if (!msg) throw new HttpError(404, "질문을 찾을 수 없어요.");
  const listing = await getListing(msg.listing_id);
  if (listing.seller_id !== user.id) throw new HttpError(403, "이 매물의 양도인만 답할 수 있어요.");
  const reply = text.trim().slice(0, 1000);
  if (!reply) throw new HttpError(400, "답변 내용을 입력해주세요.");
  // 자료로 이미 답한 직접 질문(자료로 못 답한 부분만 양도인에게 온 경우)은 기존 답과 근거를 두고 뒤에 붙인다
  const keep = msg.answer_type === "auto";
  const update = keep
    ? { answer: `${msg.answer}\n\n양도인 직접 답변 (점주 진술): ${reply}`, updated_at: new Date().toISOString() }
    : { status: "answered", answer_type: "seller_reply", answer: reply, evidence: [], ai_used: false, error: null, updated_at: new Date().toISOString() };
  const { data, error: saveError } = await supabase
    .from("agent_messages")
    .update(update)
    .eq("id", messageId)
    .select("*")
    .single();
  if (saveError) throw saveError;
  await audit(user.id, "agent_answer", listing.id, `${msg.topic}: seller_reply`);
  return data as AgentMessage;
}

// 권한이 줄었을 때(승인 회수, NDA 철회): 이미 받은 답도 지금 권한으로 다시 계산해서,
// 더 볼 수 없는 숫자가 답·근거에 남지 않게 한다
export async function reanswerAfterAccessLoss(listingId: string, buyerId: string) {
  const { data, error } = await getSupabase()
    .from("agent_messages")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .eq("answer_type", "auto");
  if (error) throw error;
  for (const m of data ?? []) await answerQuestion(m.id);
}
