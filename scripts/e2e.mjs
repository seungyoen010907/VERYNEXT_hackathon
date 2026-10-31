// 통합 테스트: 양도인 3명 + 양수인 1명 시나리오(PRD 11.1)를 API로 끝까지 돌리고 확인한다.
// 실행: npm run dev 를 켠 상태에서  node scripts/e2e.mjs   (샘플 매물을 다시 만들고, OpenAI를 여러 번 호출한다)
const H = "http://localhost:3000";
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const BUYER = "00000000-0000-0000-0000-0000000000b1";

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  console.log(results.at(-1));
}

async function api(user, path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (user) headers["x-user-id"] = user;
  if (init.body && typeof init.body === "string") headers["content-type"] = "application/json";
  const t0 = Date.now();
  const res = await fetch(H + path, { ...init, headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json, ms: Date.now() - t0 };
}
const post = (u, p, body) => api(u, p, { method: "POST", body: JSON.stringify(body ?? {}) });
const patch = (u, p, body) => api(u, p, { method: "PATCH", body: JSON.stringify(body) });

// 1. 샘플 데이터: 양도인 A·B·C 매물 + 양수인 조건
const demo = await post(BUYER, "/api/demo");
check("샘플 매물 3개 생성", demo.status === 201 && demo.json.listings?.length === 3, `${demo.ms}ms, AI 새 분석 ${demo.json.analyzed_now}개`);
const [LA, LB, LC] = demo.json.listings.map((l) => l.id);

// 2. 권한 없는 접근 차단
check("헤더 없이 요청 → 401", (await api(null, "/api/listings")).status === 401);
check("양수인이 매물 등록 → 403", (await post(BUYER, "/api/listings", { address: "x", premium: 1, deposit: 1, monthly_rent: 1, claimed_monthly_sales: 1 })).status === 403);
check("양도인 B가 A 매물 수정 → 403", (await patch(B, `/api/listings/${LA}`, { status: "draft" })).status === 403);
check("양수인이 A 요청 관리 열람 → 403", (await api(BUYER, `/api/listings/${LA}/requests`)).status === 403);
const roomA0 = (await api(BUYER, `/api/listings/${LA}`)).json;
check("NDA 전 양수인: A 자료·숫자 0개", roomA0.documents.length === 0 && roomA0.data_points.length === 0, `잠긴 항목 ${roomA0.locked.length}`);
check("NDA 전 양수인: 상호·상세주소 숨김", !("business_name" in roomA0.listing) && !("address" in roomA0.listing));
const ownerA = (await api(A, `/api/listings/${LA}`)).json;
const posDoc = ownerA.documents.find((d) => d.file_name.startsWith("3_POS"));
check("양수인 원본 다운로드 (L3) → 403", (await api(BUYER, `/api/documents/${posDoc.id}/download`)).status === 403);
const roomC0 = (await api(BUYER, `/api/listings/${LC}`)).json;
check("C의 L3 임대차계약서는 잠긴 목록에도 안 보임", !roomC0.locked.some((l) => l.label.includes("임대차")));
check("양도인 매물 3개 + 양수인 추천", (await api(BUYER, "/api/listings")).json.published.filter((l) => l.is_sample).length === 3);

// 3. 오류 케이스
check("실사: 매물 0개 → 400", (await post(BUYER, "/api/agent/tasks", { listing_ids: [] })).status === 400);
check("실사: 매물 4개 → 400", (await post(BUYER, "/api/agent/tasks", { listing_ids: [LA, LB, LC, LA.replace(/.$/, "0")] })).status === 400);
check("실사: 양도인이 시작 → 403", (await post(A, "/api/agent/tasks", { listing_ids: [LA] })).status === 403);
check("실사: 없는 매물 → 404", (await post(BUYER, "/api/agent/tasks", { listing_ids: ["00000000-0000-0000-0000-000000000999"] })).status === 404);

// 4. 양수인 AI → 양도인 AI 3곳 동시 질문 (NDA 전)
const t1 = await post(BUYER, "/api/agent/tasks", { listing_ids: [LA, LB, LC] });
check("실사 시작 (3개 매물 동시)", t1.status === 201, `${t1.ms}ms`);
const TID = t1.json.task_id;
let d = (await api(BUYER, `/api/agent/tasks/${TID}`)).json;
const by = (lid, topic) => d.messages.find((m) => m.listing_id === lid && m.topic === topic);
check("B: 이미 공개(L0)된 매출·시설은 묻지 않음", !by(LB, "sales") && !by(LB, "facility"));
check("B 비용(L1): NDA 필요로 거부", by(LB, "cost")?.answer_type === "denied" && by(LB, "cost").answer.includes("NDA"));
check("C 임대차(L3): 접근 거부", by(LC, "lease")?.answer_type === "denied" && by(LC, "lease").answer.includes("L3"));
check("C 비용: 자료 없음 → 추가 자료 요청", by(LC, "cost")?.status === "needs_documents");
check("거부된 답에는 근거(숫자)가 없음", d.messages.filter((m) => m.answer_type === "denied").every((m) => m.evidence.length === 0));
check("질문은 100자 안팎으로 짧게", d.messages.every((m) => m.question.length <= 140), `최대 ${Math.max(...d.messages.map((m) => m.question.length))}자`);
const firstCount = d.messages.length;

// 5. NDA 테스트 동의 → 다시 묻기
for (const L of [LA, LB, LC]) await post(BUYER, `/api/listings/${L}/nda`, { agree: true });
const rr = await post(BUYER, `/api/agent/tasks/${TID}/rerun`);
check("NDA 동의 후 다시 묻기", rr.status === 200, `${rr.ms}ms`);
d = (await api(BUYER, `/api/agent/tasks/${TID}`)).json;
check("A 매출(L1): 근거와 함께 자동 응답", by(LA, "sales")?.answer_type === "auto" && by(LA, "sales").evidence.length > 0);
check("A 비용(L2): 양도인 승인 대기 + 열람 요청 생성", by(LA, "cost")?.status === "pending_approval" && !!by(LA, "cost").grant_id);
check("B 임대차(L2): 양도인 승인 대기", by(LB, "lease")?.status === "pending_approval");
const aCostPending = by(LA, "cost");
check("승인 전 A 비용 답에 비용 숫자 없음", aCostPending.evidence.length === 0 && !/\d{1,3}(,\d{3}){2}원/.test(aCostPending.answer));
check("답변에 내부 용어(computed 등) 없음", d.messages.every((m) => !/computed|allowed_data/.test(m.answer ?? "")));
check("답변에 마크다운 표 없음", d.messages.every((m) => !(m.answer ?? "").includes("|---")));
let cmp = (await api(BUYER, `/api/compare?ids=${LA},${LB},${LC}`)).json;
const rowA = () => cmp.rows.find((r) => r.facts.listing.id === LA);
check("승인 전 A 순수익은 미확인", rowA().facts.confirmed_profit.value === null);

// 6. 양도인 승인 → 자동 재응답, 다른 양도인은 승인 불가
const reqA = (await api(A, `/api/listings/${LA}/requests`)).json;
const gA = reqA.grants.find((g) => g.status === "requested");
check("A 요청 관리에 AI 질문 연결된 요청 표시", !!gA && reqA.questions.some((q) => q.grant_id === gA.id));
check("양도인 B가 A의 요청 승인 → 403", (await patch(B, `/api/grants/${gA.id}`, { action: "approve" })).status === 403);
const ap = await patch(A, `/api/grants/${gA.id}`, { action: "approve" });
check("양도인 A 승인", ap.status === 200, `${ap.ms}ms (재응답 포함)`);
const reqB = (await api(B, `/api/listings/${LB}/requests`)).json;
for (const g of reqB.grants.filter((g) => g.status === "requested")) await patch(B, `/api/grants/${g.id}`, { action: "approve" });
d = (await api(BUYER, `/api/agent/tasks/${TID}`)).json;
check("승인 뒤 A 비용 자동 응답", by(LA, "cost")?.answer_type === "auto" && by(LA, "cost").evidence.length > 0);
check("승인 뒤 A 운영(같은 자료) 자동 응답", by(LA, "operation")?.answer_type === "auto");
check("승인 뒤 B 임대차 자동 응답", by(LB, "lease")?.answer_type === "auto");
cmp = (await api(BUYER, `/api/compare?ids=${LA},${LB},${LC}`)).json;
check("비교표 갱신: A 순수익 계산됨", rowA().facts.confirmed_profit.value !== null, `${rowA().facts.confirmed_profit.value}원`);
check("C 비용은 0이 아니라 미확인", cmp.rows.find((r) => r.facts.listing.id === LC).facts.monthly_cost_avg.value === null);
check("C 주장 매출 차이 경고 (-20%)", cmp.rows.find((r) => r.facts.listing.id === LC).risks.some((x) => x.title.includes("월매출")));
check("A 6월 POS 위험이 1순위", rowA().risks[0]?.title.includes("POS"));

// 7. 통합 분석 (AI)
const sm = await post(BUYER, `/api/agent/tasks/${TID}/summary`);
check("양수인 AI 통합 분석 생성", sm.status === 201 && !!sm.json.ai_summary?.result?.headline, `${sm.ms}ms`);

// 8. 새로고침 후 유지 + 중복 질문 방지
const again = (await api(BUYER, `/api/agent/tasks/${TID}`)).json;
check("새로고침 후 질문·답 유지", again.messages.length === d.messages.length && !!again.ai_summary);
const t2 = await post(BUYER, "/api/agent/tasks", { listing_ids: [LA, LB, LC] });
const after = (await api(BUYER, `/api/agent/tasks/${t2.json.task_id}`)).json;
const keys = after.messages.map((m) => `${m.listing_id}|${m.topic}`);
check("같은 매물로 다시 실사해도 같은 질문 중복 없음", new Set(keys).size === keys.length, `질문 ${after.messages.length}개 (처음 ${firstCount}개)`);

// 9. 권한 회수 → 이전 답에서도 숫자가 사라짐
const ap2 = await patch(A, `/api/grants/${gA.id}`, { action: "revoke" });
d = (await api(BUYER, `/api/agent/tasks/${t2.json.task_id}`)).json;
check("회수 뒤 A 비용 답에 근거 없음", ap2.status === 200 && by(LA, "cost")?.evidence.length === 0 && by(LA, "cost").answer_type !== "auto", by(LA, "cost")?.answer?.slice(0, 40));
check("회수된 자료는 AI가 다시 요청하지 않음", (await api(A, `/api/listings/${LA}/requests`)).json.grants.filter((g) => g.status === "requested").length === 0);
cmp = (await api(BUYER, `/api/compare?ids=${LA}`)).json;
check("회수 뒤 비교표에서 A 비용 다시 미확인", cmp.rows[0].facts.monthly_cost_avg.value === null);

// 10. 열람 기록
const logs = (await api(A, `/api/listings/${LA}/requests`)).json.logs.map((l) => l.action);
check("열람·승인·회수·AI 답변 기록 남음", ["view_dataroom", "grant_approve", "grant_revoke", "agent_answer", "nda_agree"].every((a) => logs.includes(a)));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
