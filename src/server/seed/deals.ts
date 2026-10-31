/**
 * 시연용 거래 대화 (가상 데이터). 테스트 매물에만 만든다.
 *  - 매출 불일치 한식당: 메시지 12건, 아직 분석 전 (대화 누적 조건 충족 상태)
 *  - 정상 매출 카페: 분석 1회 완료 후 대화 이어짐
 *  - 증빙 부족 분식점: 양수인이 POS 자료를 요청, 양도인 제출 대기
 */
import type { Db } from "../db/client";
import { runDealAnalysis } from "../deals/agent";
import { sendMessage, startDeal } from "../deals/repo";
import { DEMO_USERS } from "../viewer";

type Line = ["s" | "b", string, ("request" | "text")?, string[]?];

const SCRIPTS: Record<string, { lines: Line[]; analyze?: boolean; after?: Line[] }> = {
  "[테스트] 매출 불일치 한식당": {
    lines: [
      ["b", "안녕하세요. 한식당 매물 보고 연락드립니다. 월 매출이 어느 정도 되나요?"],
      ["s", "점심 장사 위주로 월매출 평균 4,500만 원 정도 나옵니다. 순수익은 1,500만 원 정도예요."],
      ["b", "권리금 8천만 원은 조정 가능할까요?"],
      ["s", "매출 생각하면 적정하다고 봅니다. 단골 손님이 많아서 매출은 꾸준합니다."],
      ["b", "최근 12개월 POS 자료랑 카드 매출 내역 보내주실 수 있나요?", "request", ["pos_sales", "card_sales"]],
      ["s", "네 준비해서 올리겠습니다. 현금 손님도 많아서 현금 비중이 25% 정도 됩니다."],
      ["b", "월세는 얼마인가요?"],
      ["s", "월세는 330만 원이고 관리비는 별도입니다."],
      ["b", "인건비는 어떻게 되나요?"],
      ["s", "직원 2명에 제가 같이 일해서 제 인건비는 따로 안 잡았어요."],
      ["s", "아 그리고 매출은 보수적으로 4,000만 원 정도로 보시면 됩니다."],
      ["b", "알겠습니다. 자료 보고 다시 말씀드릴게요."],
    ],
  },
  "[테스트] 정상 매출 카페": {
    lines: [
      ["b", "카페 매물 관심 있습니다. 월매출 3,000만 원이 맞나요?"],
      ["s", "네 최근 6개월 평균 월매출 3,000만 원입니다. POS랑 카드, 배달 정산 자료 다 올려두었어요."],
      ["b", "임대차 계약서도 볼 수 있을까요?", "request", ["lease_contract"]],
      ["s", "계약서도 등록되어 있습니다. 월세 200만 원, 보증금 3,000만 원이에요."],
    ],
    analyze: true,
    after: [
      ["b", "광고비는 따로 쓰시나요?"],
      ["s", "인스타 광고를 가끔 하는데 월 20만 원 안쪽입니다."],
    ],
  },
  "[테스트] 증빙 부족 분식점": {
    lines: [
      ["b", "분식점 매물 문의드립니다. 매출 자료를 볼 수 있을까요?"],
      ["s", "월매출 2,200만 원 정도이고 현금으로 결제하시는 학생 손님이 많습니다."],
      ["b", "POS 월별 매출 자료와 재료비·인건비 자료를 보내주세요.", "request", ["pos_sales", "expense_material", "expense_labor"]],
    ],
  },
};

export async function seedDeals(db: Db): Promise<void> {
  const stores = await db.query<{ id: string; name: string }>(`select id, name from stores where is_test_data and is_published`);
  for (const s of stores) {
    const script = SCRIPTS[s.name];
    if (!script) continue;
    const { deal } = await startDeal(db, DEMO_USERS.buyer, { storeId: s.id });
    const say = async ([who, body, kind, taskKeys]: Line) =>
      sendMessage(db, who === "s" ? DEMO_USERS.seller : DEMO_USERS.buyer, deal.id, { body, kind: kind ?? "text", taskKeys: taskKeys ?? [] });
    for (const l of script.lines) await say(l);
    if (script.analyze) await runDealAnalysis(db, DEMO_USERS.buyer, deal.id);
    for (const l of script.after ?? []) await say(l);
  }
}

export async function seedDealsIfEmpty(db: Db): Promise<void> {
  const rows = await db.query<{ n: number }>(`select count(*)::int as n from deals`);
  if (rows[0].n === 0) await seedDeals(db);
}
