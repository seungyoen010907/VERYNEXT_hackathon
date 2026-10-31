// F08 테스트: 양도인 입력(비용·시설) → 권한 → 매출 증빙 → 시설 판정 (PRD F08, docs/API.md 11번).
// 실행: npm run dev 를 켠 상태에서  node scripts/e2e-f08.mjs   (샘플 매물을 다시 만든다. 새 시설을 넣을 때 AI를 한 번 부른다)
const H = "http://localhost:3000";
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const BUYER = "00000000-0000-0000-0000-0000000000b1";

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function api(user, path, init = {}) {
  const headers = {};
  if (user) headers["x-user-id"] = user;
  if (init.body) headers["content-type"] = "application/json";
  const res = await fetch(H + path, { ...init, headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}
const post = (u, p, body) => api(u, p, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = (u, p, body) => api(u, p, { method: "PUT", body: JSON.stringify(body) });
const patch = (u, p, body) => api(u, p, { method: "PATCH", body: JSON.stringify(body) });
const row = async (lid) => (await api(BUYER, `/api/compare?ids=${lid}`)).json.rows?.[0];

const demo = await post(BUYER, "/api/demo");
check("샘플 매물 준비", demo.status === 201, JSON.stringify(demo.json).slice(0, 120));
const [LA, LB, LC] = demo.json.listings.map((l) => l.id);

// 1. 양도인 입력 권한
const inA = await api(A, `/api/listings/${LA}/inputs`);
check("양도인 A 입력값 조회", inA.status === 200 && inA.json.facilities.length === 7, `시설 ${inA.json.facilities?.length}개`);
check("시설 입력 공개 등급 L1", inA.json.levels?.input_facility?.level === "L1");
check("양수인은 입력값 조회 못 함 → 403", (await api(BUYER, `/api/listings/${LA}/inputs`)).status === 403);
check("양도인 B가 A 입력 저장 → 403", (await put(B, `/api/listings/${LA}/inputs`, { costs: [] })).status === 403);
check("음수 금액 → 400", (await put(B, `/api/listings/${LB}/inputs`, { costs: [{ name: "재료비", amount: -1 }] })).status === 400);
check("이름 없는 비용 → 400", (await put(B, `/api/listings/${LB}/inputs`, { costs: [{ name: "", amount: 100 }] })).status === 400);

// 2. 자동 분류 (B 샘플 비용)
const inB = (await api(B, `/api/listings/${LB}/inputs`)).json;
const kind = (name) => inB.costs.find((c) => c.name.includes(name))?.kind;
check("재료비 → 변동비", kind("재료비") === "variable");
check("수수료 → 변동비", kind("수수료") === "variable");
check("인건비 → 고정비", kind("인건비") === "fixed");
check("공과금 → 확인 필요", kind("공과금") === "unknown");
check("배달 광고비 → 확인 필요", kind("광고") === "unknown");
check("인력 구성 저장 (가족 1, 직원 2)", inB.labor?.family === 1 && inB.labor?.staff === 2);

// 직접 바꾼 분류는 유지된다
const override = await put(B, `/api/listings/${LB}/inputs`, {
  costs: [...inB.costs.map((c) => (c.name.includes("공과금") ? { ...c, kind: "variable", kind_source: "user" } : c))],
});
check("분류 직접 지정 유지", override.status === 200 && override.json.costs.find((c) => c.name.includes("공과금"))?.kind === "variable");

// 3. 권한: NDA 전에는 L1 입력값(시설·비용)이 계산에 안 들어간다
let rA = await row(LA);
let rB = await row(LB);
check("NDA 전 A 시설 목록 안 보임 (L1)", rA.facts.facility.rows.length === 0);
check("NDA 전 B 비용은 계산에 없음 (L1)", rB.facts.cost_source === null);
check("NDA 전 B 시설 목록 보임 (L0)", rB.facts.facility.rows.length === 6);
check("NDA 전 A 매출 증빙은 미확인 (리포트 L1)", rA.facts.evidence.claimed === null);
check("NDA 전 A 주장 현금매출 숨김", rA.facts.listing.claimed_monthly_cash_sales === null);

await post(BUYER, `/api/listings/${LA}/nda`, { agree: true });
await post(BUYER, `/api/listings/${LB}/nda`, { agree: true });
rA = await row(LA);
rB = await row(LB);

// 4. 매출 증빙 (샘플분식: 6월 POS 부풀림 → 교차 확인에서 빠진다)
const ev = rA.facts.evidence;
check("A 주장 월매출 35,000,000원", ev.claimed === 35_000_000);
check("A 6월은 교차 확인에서 빠짐", !ev.verified_months.includes("2026-06") && ev.excluded.some((e) => e.month === "2026-06"), `확인 ${ev.verified_months.join(",")}`);
check("A 교차 확인 매출 계산", ev.verified !== null && ev.verified > 20_000_000 && ev.verified < 35_000_000, String(ev.verified));
check("A 미확인 매출 = 주장 − 확인", ev.unverified === ev.claimed - ev.verified);
check("A 증빙 수준 있음", ["high", "medium", "low"].includes(ev.level), `${ev.level} ${Math.round(ev.rate * 100)}%`);
check("A 현금매출 근거 미제출 경고", ev.warnings.some((w) => w.startsWith("현금매출")));
check("A 6월 차이 확인 필요 경고", ev.warnings.some((w) => w.includes("2026-06")));
check("A 비용은 파일 자료(입력 없음)로 분류", rA.facts.cost_source === null || rA.facts.cost_source === "document");

// 5. 시설 (A: 렌탈 제외, 인테리어 0원)
const fr = rA.facts.facility;
check("NDA 후 A 시설 7개", fr.rows.length === 7);
check("렌탈 정수기 제외", fr.rows.find((r) => r.name === "정수기")?.verdict === "excluded");
check("인테리어 처분가 0원", fr.rows.find((r) => r.name === "인테리어")?.verdict === "interior" && fr.rows.find((r) => r.name === "인테리어").counted === 0);
check("확인 가능한 시설 가치 = 추정 하단 합", fr.value === fr.rows.reduce((a, r) => a + r.counted, 0), String(fr.value));
check("초과 요구 금액 = 시설권리금 − 시설 가치", fr.excess === Math.max(0, 20_000_000 - fr.value), String(fr.excess));
const estimated = fr.rows.filter((r) => r.low !== null).length;
check("AI 추정 또는 시세 미확인으로 판정", fr.rows.every((r) => r.verdict !== "ok" || r.low !== null), `추정된 시설 ${estimated}개`);
check("렌탈 시설 위험 표시", rA.risks.some((r) => r.title.includes("렌탈")));

// 6. B: 입력 비용 사용, 가족 인건비 경고, 미분류 권리금 없음
check("NDA 후 B 비용은 양도인 입력", rB.facts.cost_source === "input");
check("B 월세를 고정비에 더함", rB.facts.cost_lines.some((l) => l.name === "월세" && l.kind === "fixed"));
check("B 가족·동업자 인건비 경고", rB.risks.some((r) => r.title.includes("가족")));
check("C 바닥권리금 30,000,000원 / 시설 미분류", (await row(LC)).facts.premium_parts.floor === 30_000_000);

// 7. 새 시설 저장 → AI 추정 (실패해도 저장)
const before = (await api(B, `/api/listings/${LB}/inputs`)).json.facilities;
const added = await put(B, `/api/listings/${LB}/inputs`, {
  facilities: [...before, { name: "업소용 오븐", brand_model: "우녹스 XFT133", qty: 1, purchase_year: 2024, purchase_price: 4_000_000, condition: "양호", ownership: "owned", claimed_value: 3_000_000 }],
});
const oven = added.json.facilities?.find((f) => f.name === "업소용 오븐");
check("새 시설 저장", added.status === 200 && !!oven, added.json.ai_failed ? "AI 실패 → 시세 미확인" : `추정 ${oven?.estimate?.low}~${oven?.estimate?.high}`);
check("AI 추정이 구매가보다 높지 않음", !oven?.estimate?.high || oven.estimate.high <= 4_000_000 * 1.2);
const kept = added.json.facilities.filter((f) => f.name !== "업소용 오븐" && f.estimate);
check("이미 추정한 시설은 재사용", kept.length >= before.filter((f) => f.estimate).length);
check("잘못된 구매 연도 → 400", (await put(B, `/api/listings/${LB}/inputs`, { facilities: [{ name: "x", purchase_year: 1800 }] })).status === 400);

// 8. 기본 정보 추가 + 공개 등급 변경
check("관리비·잔여기간 저장", (await patch(A, `/api/listings/${LA}`, { maintenance_fee: 300000, lease_remaining_months: 14 })).status === 200);
const lvl = await patch(A, `/api/documents/${inA.json.levels.input_facility.document_id}`, { summary_access_level: "L3" });
check("시설 입력 L3로 변경", lvl.status === 200);
check("L3 뒤 양수인 계산에서 시설 빠짐", (await row(LA)).facts.facility.rows.length === 0);
const room = (await api(BUYER, `/api/listings/${LA}`)).json;
check("L3 입력 항목은 잠긴 목록에도 없음", !room.locked.some((l) => l.label.includes("시설 목록")));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
