import "server-only";

// 여러 매물(최대 3개)을 같은 기준으로 비교 (PRD F05). 전부 코드 계산이고, 양수인이 볼 수 있는 자료만 쓴다.
// AI 실사 센터의 통합 분석과 비교표·리포트가 같이 쓴다.

import type { CurrentUser } from "./auth";
import { findRisks, personalFit, recommend, SCORE_WEIGHTS, type BuyerProfile, type ListingFacts, type PersonalFit, type Risk } from "./facts";
import { HttpError } from "./http";
import { getListing } from "./listings";
import { getBuyerProfile, visibleFacts } from "./visible";

export type ComparisonRow = {
  facts: ListingFacts;
  fit: PersonalFit;
  recommendation: ReturnType<typeof recommend>;
  risks: Risk[];
  unknowns: string[];
};

export type Comparison = {
  profile: BuyerProfile | null;
  weights: typeof SCORE_WEIGHTS;
  rows: ComparisonRow[];
};

export async function buildComparison(user: CurrentUser, ids: string[]): Promise<Comparison> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) throw new HttpError(400, "비교할 매물을 골라주세요.");
  if (unique.length > 3) throw new HttpError(400, "매물은 최대 3개까지 비교할 수 있어요.");
  const profile = await getBuyerProfile(user.id);
  const rows = await Promise.all(
    unique.map(async (id) => {
      const listing = await getListing(id);
      if (listing.status !== "published" && listing.seller_id !== user.id) throw new HttpError(404, "매물을 찾을 수 없어요.");
      const { facts } = await visibleFacts(user, listing);
      const fit = personalFit(facts, profile);
      const unknowns = [
        facts.monthly_sales_avg.value === null && "월평균 매출",
        facts.monthly_cost_avg.value === null && "월 비용",
        facts.confirmed_profit.value === null && "확인된 월 순수익",
        facts.owner_weekly_hours.value === null && "점주 근무시간",
        facts.lease_end.value === null && "임대차 만료일",
        facts.report_grade.value === null && "교차 검증 결과",
      ].filter((x): x is string => !!x);
      return { facts, fit, recommendation: recommend(facts, fit, profile), risks: findRisks(facts, fit, profile), unknowns };
    }),
  );
  return { profile, weights: SCORE_WEIGHTS, rows };
}
