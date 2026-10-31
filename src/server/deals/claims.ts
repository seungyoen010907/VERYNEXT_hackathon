/**
 * 거래 대화에서 금액 주장 추출 (규칙 기반)
 *
 * "월매출 3,500만 원", "3천5백만", "1억 2천만", "연 매출 4억", "현금 비중 30%" 같은 표현을 읽어
 * 어떤 항목에 대한 얼마의 주장인지 뽑는다. 해석이 애매하면 버린다 (추측하지 않는다).
 */

export const CLAIM_TYPES = ["revenue", "profit", "rent", "deposit", "premium", "maintenance", "cash_ratio"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_LABELS: Record<ClaimType, string> = {
  revenue: "월매출",
  profit: "월 순수익",
  rent: "월세",
  deposit: "보증금",
  premium: "권리금",
  maintenance: "관리비",
  cash_ratio: "현금 매출 비중",
};

export interface Claim {
  type: ClaimType;
  /** 원 단위 (cash_ratio는 0~1 비율) */
  value: number;
  messageId: string;
  seq: number;
  senderRole: "seller" | "buyer";
  /** 원문 문장 일부 */
  quote: string;
  /** 연 단위로 말해 12로 나눈 경우 */
  annualized: boolean;
}

const UNIT: Record<string, number> = { 억: 1e8, 만: 1e4 };
const SUB_UNIT: Record<string, number> = { 천: 1e3, 백: 1e2, 십: 10 };

/** "3천5백만" → 35,000,000, "1억 2천만" → 120,000,000, "35,000,000원" → 35,000,000 */
export function parseKoreanAmount(text: string): number | null {
  const s = text.replace(/[,\s]/g, "").replace(/원$/, "");
  if (!/^[\d.억천백십만]+$/.test(s) || !/[\d억만]/.test(s)) return null;
  let total = 0;
  let group = 0; // 만·억 단위로 묶기 전의 값
  let num = ""; // 읽는 중인 숫자
  const flushNum = (mult = 1) => {
    if (num === "") return mult === 1 ? 0 : mult; // "천만"처럼 숫자 없이 단위만 오면 1로 본다
    const v = Number(num);
    num = "";
    return Number.isFinite(v) ? v * mult : NaN;
  };
  for (const ch of s) {
    if (/[\d.]/.test(ch)) num += ch;
    else if (ch in SUB_UNIT) group += flushNum(SUB_UNIT[ch]);
    else if (ch in UNIT) {
      group += flushNum();
      total += (group === 0 ? 1 : group) * UNIT[ch];
      group = 0;
    }
  }
  total += group + flushNum();
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

// 금액 표현: 한글 단위가 있거나, 천 단위 콤마가 있거나, '원'으로 끝나는 숫자
const AMOUNT_RE = /(\d[\d,.]*\s*(?:억|천|백|십|만)[\d,.\s억천백십만]*원?|\d{1,3}(?:,\d{3})+\s*원?|\d+\s*원)/g;
const PERCENT_RE = /(\d{1,3}(?:\.\d+)?)\s*(%|퍼센트|프로)/g;

const KEYWORDS: Array<[ClaimType, RegExp]> = [
  ["cash_ratio", /현금/],
  ["premium", /권리금/],
  ["deposit", /보증금/],
  ["maintenance", /관리비/],
  ["rent", /월세|임대료|차임/],
  ["profit", /순수익|순이익|순익|영업이익|이익|수익|남(는|아|겨)/],
  ["revenue", /매출|매상/],
];

/** 금액 앞쪽 가까운 위치에 있는 항목 키워드를 찾는다 */
function nearestType(sentence: string, index: number, allowCash: boolean): ClaimType | null {
  const before = sentence.slice(Math.max(0, index - 24), index);
  let best: { type: ClaimType; pos: number } | null = null;
  for (const [type, re] of KEYWORDS) {
    if (type === "cash_ratio" && !allowCash) continue;
    const g = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(before))) {
      if (!best || m.index > best.pos) best = { type, pos: m.index };
    }
  }
  return best?.type ?? null;
}

export function extractClaims(message: { id: string; seq: number; body: string; senderRole: "seller" | "buyer" }): Claim[] {
  const claims: Claim[] = [];
  for (const sentence of message.body.split(/(?<=[.!?。\n])|\n/)) {
    const s = sentence.trim();
    if (!s) continue;
    for (const m of s.matchAll(AMOUNT_RE)) {
      const value = parseKoreanAmount(m[1]);
      if (value === null || value < 10_000) continue;
      const type = nearestType(s, m.index ?? 0, false);
      if (!type) continue;
      const annualized = type !== "deposit" && type !== "premium" && /연\s*(간|매출|수익|순|평균)?|1년|일년/.test(s.slice(0, m.index));
      claims.push({
        type,
        value: annualized ? Math.round(value / 12) : value,
        messageId: message.id,
        seq: message.seq,
        senderRole: message.senderRole,
        quote: s.slice(0, 120),
        annualized,
      });
    }
    for (const m of s.matchAll(PERCENT_RE)) {
      if (nearestType(s, m.index ?? 0, true) !== "cash_ratio") continue;
      const v = Number(m[1]) / 100;
      if (v <= 0 || v > 1) continue;
      claims.push({ type: "cash_ratio", value: v, messageId: message.id, seq: message.seq, senderRole: message.senderRole, quote: s.slice(0, 120), annualized: false });
    }
  }
  return claims;
}

// -----------------------------------------------------------------------------
// 합의 후보, 확인이 필요한 발언, 자료 요청
// -----------------------------------------------------------------------------
const AGREEMENT_RE = /(합의|동의(합니다|해요|드립니다)|좋습니다|좋아요|그렇게 (하죠|하겠습니다|할게요)|확정|진행하(죠|겠습니다|시죠)|괜찮습니다|수락)/;

export function isAgreement(body: string): boolean {
  return AGREEMENT_RE.test(body) && !/[?？]\s*$/.test(body.trim());
}

/** 양도인 발언 중 객관적 확인이 필요한 표현과 그에 맞는 확인 질문 */
export const STATEMENT_CHECKS: Array<{ key: string; re: RegExp; topic: string; question: string }> = [
  { key: "cash", re: /현금(으로|만| 매출| 결제| 손님| 장사)/, topic: "현금 매출", question: "현금 매출을 확인할 수 있는 현금영수증 발행 내역이나 통장 입금 내역을 보여주실 수 있나요?" },
  { key: "unreported", re: /신고(를|는)?\s*(안|덜|적게)|세금(을|은)?\s*(덜|안)|누락/, topic: "신고 매출과 실제 매출 차이", question: "신고 매출과 실제 매출이 다르다면, 차이를 증빙할 자료가 있나요? (신고되지 않은 매출은 인수 후 보장되기 어렵습니다)" },
  { key: "verbal", re: /구두(로)?|말로만|계약서(는|가)?\s*(없|안)/, topic: "문서 없는 약속", question: "구두로 정한 조건을 문서(계약서·확인서)로 받을 수 있나요?" },
  { key: "solo", re: /혼자|직원\s*없이|가족(이|끼리)|(사장|제|본인|내)\s*(인건비|월급)/, topic: "인건비 반영", question: "현재 운영자 본인(가족)의 노동이 인건비로 반영되어 있나요? 인수 후 직원을 고용하면 비용이 얼마나 늘어날까요?" },
  { key: "guarantee", re: /보장|무조건|확실(히|합니다)|최소\s*\d|이상은\s*(나|됩)/, topic: "수익 보장 표현", question: "말씀하신 수준을 보여주는 기간별 매출·비용 자료를 받을 수 있나요?" },
  { key: "regulars", re: /단골|고정\s*(손님|고객)|입소문/, topic: "양도인 개인에 의존하는 매출", question: "양도인이 바뀌어도 유지될 매출인지 확인하기 위해 인수인계 기간과 방식을 정할 수 있나요?" },
  { key: "landlord", re: /임대인|건물주|주인(분|이)/, topic: "임대인 관련 발언", question: "임대인의 양도 동의와 계약 갱신 조건을 서면으로 확인할 수 있나요?" },
  { key: "redevelop", re: /재건축|재개발|철거|리모델링/, topic: "건물 재건축·철거 가능성", question: "건물 재건축·철거 계획이나 임대인 통보가 있었나요?" },
];

const REQUEST_VERB_RE = /(보내|요청|주세요|주실|부탁|공유|제출|받을 수|볼 수|확인할 수|있나요|있을까요|가능할까요|올려)/;

/** 양수인 메시지의 자료 요청 표현 → 체크리스트 업무 키 */
export const REQUEST_KEYWORDS: Array<{ re: RegExp; taskKey: string }> = [
  { re: /POS|포스|월별\s*매출/i, taskKey: "pos_sales" },
  { re: /카드\s*(매출|내역|승인)|여신/, taskKey: "card_sales" },
  { re: /현금\s*영수증|통장\s*입금/, taskKey: "cash_receipts" },
  { re: /배달|배민|쿠팡이츠|요기요|정산/, taskKey: "delivery_sales" },
  { re: /재료|매입|식자재/, taskKey: "expense_material" },
  { re: /인건비|급여|월급|원천/, taskKey: "expense_labor" },
  { re: /관리비|공과금|전기|가스|수도/, taskKey: "expense_overhead" },
  { re: /광고/, taskKey: "expense_other" },
  { re: /임대차|계약서/, taskKey: "lease_contract" },
  { re: /임대인\s*동의|건물주\s*동의/, taskKey: "landlord_consent" },
  { re: /갱신|계약\s*기간|잔여\s*기간/, taskKey: "lease_renewal" },
  { re: /시설|집기|장비|인테리어/, taskKey: "asset_scope" },
  { re: /직원|고용|근로/, taskKey: "staff_terms" },
  { re: /인허가|영업\s*신고|영업\s*허가|사업자/, taskKey: "permits" },
  { re: /거래처|납품/, taskKey: "suppliers" },
];

export function detectRequests(body: string): string[] {
  if (!REQUEST_VERB_RE.test(body)) return [];
  return [...new Set(REQUEST_KEYWORDS.filter((k) => k.re.test(body)).map((k) => k.taskKey))];
}
