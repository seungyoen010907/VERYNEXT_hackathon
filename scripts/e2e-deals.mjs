// 거래방 테스트: 매물 × 양수인 거래방의 체크리스트·단계·메시지·권한 (PRD 11.2).
// 실행: npm run dev 를 켠 상태에서  node scripts/e2e-deals.mjs   (샘플 매물을 다시 만든다. 새 AI 분석은 없다)
const H = "http://localhost:3000";
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const BUYER = "00000000-0000-0000-0000-0000000000b1";

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
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
const patch = (u, p, body) => api(u, p, { method: "PATCH", body: JSON.stringify(body) });

const demo = await post(BUYER, "/api/demo");
check("샘플 매물 준비", demo.status === 201, `AI 새 분석 ${demo.json.analyzed_now}개`);
const [LA, LB] = demo.json.listings.map((l) => l.id);

// 1. 권한
check("양도인 A가 양수인 지정 없이 열기 → 400", (await api(A, `/api/deals/${LA}`)).status === 400);
check("양수인이 열기 전 양도인 A가 열기 → 404", (await api(A, `/api/deals/${LA}?buyer=${BUYER}`)).status === 404);
check("헤더 없이 → 401", (await api(null, `/api/deals/${LA}`)).status === 401);

// 2. 양수인이 거래방을 연다 → 체크리스트 생성 + 안내 메시지
const room = await api(BUYER, `/api/deals/${LA}`);
check("양수인이 거래방 열기", room.status === 200 && room.json.checklist.length > 0, `항목 ${room.json.checklist?.length}개, 단계 ${room.json.stage}`);
check("양수인에게는 상세 주소 없음", room.json.listing && !("address" in room.json.listing));
const again = await api(BUYER, `/api/deals/${LA}`);
check("다시 열어도 체크리스트 중복 없음", again.json.checklist.length === room.json.checklist.length);
check("양도인 B는 A 매물 거래방 못 봄", (await api(B, `/api/deals/${LA}?buyer=${BUYER}`)).status === 404 || (await api(B, `/api/deals/${LA}?buyer=${BUYER}`)).status === 403);
const sellerRoom = await api(A, `/api/deals/${LA}?buyer=${BUYER}`);
check("양도인 A는 양수인 거래방 열기", sellerRoom.status === 200 && sellerRoom.json.my_role === "seller" && "address" in sellerRoom.json.listing);
check(
  "양쪽이 같은 체크리스트 상태를 봄",
  JSON.stringify(sellerRoom.json.checklist.map((i) => i.status)) === JSON.stringify(room.json.checklist.map((i) => i.status)),
);

const item = (key) => room.json.checklist.find((i) => i.key === key);
const autoItem = room.json.checklist.find((i) => i.auto);
const autoDone = room.json.checklist.filter((i) => i.auto && i.status === "done").map((i) => i.key);
check("자료 제출 항목이 데이터룸 공개 자료로 자동 체크", autoDone.length > 0, autoDone.join(", "));

// 3. 체크리스트 권한·단계 진행
const consent = item("seller_consent");
check("양수인이 양도인 항목 체크 → 403", (await patch(BUYER, `/api/deals/${LA}/checklist/${consent.id}`, { status: "done" })).status === 403);
check("자동 항목 직접 체크 → 400", (await patch(A, `/api/deals/${LA}/checklist/${autoItem.id}?buyer=${BUYER}`, { status: "done" })).status === 400);
check("이상한 status → 400", (await patch(A, `/api/deals/${LA}/checklist/${consent.id}`, { status: "x" })).status === 400);
check("다른 매물 경로로 항목 수정 → 404", (await patch(B, `/api/deals/${LB}/checklist/${consent.id}`, { status: "done" })).status === 404);

const c1 = await patch(A, `/api/deals/${LA}/checklist/${consent.id}`, { status: "done" });
check("양도인이 동의 항목 완료", c1.status === 200 && c1.json.checklist.find((i) => i.id === consent.id).status === "done", `단계 ${c1.json.stage}`);
check("동의 단계를 넘어감", c1.json.stage !== "consent");

// 인수인계: 양도인 '넘김' 전에는 양수인 확인 불가 → 넘김 → 확인 완료
const ho = item("utilities");
check("넘기기 전 양수인 확인 → 400", (await patch(BUYER, `/api/deals/${LA}/checklist/${ho.id}`, { status: "confirmed" })).status === 400);
check("양도인 '넘김'", (await patch(A, `/api/deals/${LA}/checklist/${ho.id}`, { status: "done" })).status === 200);
check("양도인이 확인 완료 → 403", (await patch(A, `/api/deals/${LA}/checklist/${ho.id}`, { status: "confirmed" })).status === 403);
const conf = await patch(BUYER, `/api/deals/${LA}/checklist/${ho.id}`, { status: "confirmed" });
check("양수인 확인 완료", conf.status === 200 && conf.json.checklist.find((i) => i.id === ho.id).status === "confirmed");

// 4. 메시지
const m0 = await api(BUYER, `/api/deals/${LA}/messages`);
const agentMsgs = m0.json.messages.filter((m) => m.role === "agent");
check("에이전트 안내 메시지 (거래방 열림 + 단계 바뀜)", agentMsgs.length >= 2, agentMsgs.map((m) => m.body).join(" / "));
const last = m0.json.messages.at(-1).created_at;
check("빈 메시지 → 400", (await post(BUYER, `/api/deals/${LA}/messages`, { body: "  " })).status === 400);
const sent = await post(BUYER, `/api/deals/${LA}/messages`, { body: "6월 POS 매출 소명 부탁드려요." });
check("양수인 메시지 보내기", sent.status === 201 && sent.json.message.role === "buyer");
const reply = await post(A, `/api/deals/${LA}/messages?buyer=${BUYER}`, { body: "카드매출 자료로 확인해 드릴게요." });
check("양도인 답장", reply.status === 201 && reply.json.message.role === "seller");
const newer = await api(BUYER, `/api/deals/${LA}/messages?after=${encodeURIComponent(last)}`);
check("?after= 로 새 메시지만", newer.json.messages.length === 2, `${newer.json.messages.length}개`);
check("양도인 B는 메시지 못 봄", [403, 404].includes((await api(B, `/api/deals/${LA}/messages?buyer=${BUYER}`)).status));

// 5. 목록
const lb = (await api(BUYER, "/api/deals")).json.deals ?? [];
const la = (await api(A, "/api/deals")).json.deals ?? [];
check("양수인 목록에 거래방", lb.some((d) => d.listing_id === LA));
check("양도인 A 목록에 양수인 거래방", la.some((d) => d.listing_id === LA && d.buyer_id === BUYER));
check("양도인 B 목록에는 없음", !((await api(B, "/api/deals")).json.deals ?? []).some((d) => d.listing_id === LA));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
