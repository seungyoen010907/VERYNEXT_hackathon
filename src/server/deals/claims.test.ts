import { describe, expect, it } from "vitest";
import { detectRequests, extractClaims, isAgreement, parseKoreanAmount } from "./claims";

describe("parseKoreanAmount", () => {
  it.each([
    ["3,500만", 35_000_000],
    ["3500만원", 35_000_000],
    ["3천5백만", 35_000_000],
    ["1억 2천만", 120_000_000],
    ["1억", 100_000_000],
    ["4억5000만", 450_000_000],
    ["35,000,000원", 35_000_000],
    ["200만 원", 2_000_000],
    ["천만", 10_000_000],
    ["abc", null],
  ])("%s → %s", (input, expected) => {
    expect(parseKoreanAmount(input)).toBe(expected);
  });
});

const msg = (body: string, senderRole: "seller" | "buyer" = "seller") => ({ id: "m1", seq: 1, body, senderRole });

describe("extractClaims", () => {
  it("항목 키워드와 금액을 연결한다", () => {
    const c = extractClaims(msg("월매출은 평균 4,500만 원 정도이고 순수익은 1,500만 원 남습니다. 월세는 350만원이에요."));
    expect(c.map((x) => [x.type, x.value])).toEqual([
      ["revenue", 45_000_000],
      ["profit", 15_000_000],
      ["rent", 3_500_000],
    ]);
  });

  it("연 매출은 12로 나눠 월 기준으로 바꾸고 표시한다", () => {
    const [c] = extractClaims(msg("연 매출이 4억 8천만 정도 됩니다"));
    expect(c).toMatchObject({ type: "revenue", value: 40_000_000, annualized: true });
  });

  it("현금 비중 퍼센트를 읽는다", () => {
    const c = extractClaims(msg("현금 손님이 많아서 현금 비중이 30% 정도예요"));
    expect(c.find((x) => x.type === "cash_ratio")?.value).toBe(0.3);
  });

  it("항목을 알 수 없는 금액은 버린다", () => {
    expect(extractClaims(msg("어제 3천만 원짜리 차를 봤어요"))).toEqual([]);
  });
});

describe("요청·합의 감지", () => {
  it("양수인의 자료 요청을 체크리스트 업무로 연결한다", () => {
    expect(detectRequests("최근 12개월 POS 자료랑 카드 매출 내역 보내주세요")).toEqual(["pos_sales", "card_sales"]);
    expect(detectRequests("POS는 잘 쓰고 계신가봐요")).toEqual([]);
  });

  it("질문은 합의로 보지 않는다", () => {
    expect(isAgreement("권리금 7천으로 합의하겠습니다")).toBe(true);
    expect(isAgreement("이 조건이면 괜찮습니다?")).toBe(false);
  });
});
