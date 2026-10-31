# PROMPTS: 단계별로 AI에게 시키는 법

> 바이브 코딩의 핵심은 "한 번에 다 시키지 않기"다. Step 하나 시키고 -> 직접 눈으로 확인하고 -> 이해 질문 하나 던지고 -> 커밋. 이 루프를 5번 돈다.
> Claude Code는 `claude`, Codex는 `codex`로 프로젝트 폴더에서 실행한다. 둘 다 `AGENTS.md`를 읽는다 (Claude Code는 `CLAUDE.md`를 통해).

## 루프

```
문서 확인 -> 프롬프트 -> AI 구현 -> 내가 직접 확인 -> 이해 질문 -> git commit
```

AI가 "다 됐습니다"라고 해도 믿지 마라. 확인은 내가 한다. 브라우저에서 눌러 보고, 터미널 로그 보고, Supabase 화면 열어 본다.

이 서비스는 **돈과 남의 매출 자료**를 다룬다. 그래서 확인할 게 두 가지 더 있다.
- 숫자가 맞는지: 샘플 자료(`samples/`)로 돌려서 내가 아는 답이 나오는지 본다.
- 자료가 새지 않는지: 권한 없는 역할로 바꿔서 자료가 안 보이는지 본다.

### 샘플 자료 정답 (확인할 때 쓴다)

가상 점포 '샘플분식', 2026년 1~6월.

| 자료 | 정답 |
|---|---|
| `1_카드매출_2026상반기.xlsx` | 월 2,280만~2,700만 원, 6개월 합계 151,500,000원 |
| `2_배달앱_정산내역.csv` (EUC-KR) | 월 580만~730만 원 |
| `3_POS_월별리포트_캡처.png` | 6월만 48,200,000원으로 부풀려져 있음 (다른 자료 기준 약 3,420만 원) |
| `4_부가세신고_요약.pdf` | 2026년 1기 과세표준 195,000,000원 |

→ 검증하면 **POS 6월이 '확인 필요'**로 떠야 한다. 안 뜨면 검증 로직이 틀린 것이다.

---

## Step 0. 계획 세우기 (코드 0줄)

```
docs/PRD.md, docs/DESIGN.md, docs/API.md, AGENTS.md를 읽어.
1) 이 프로젝트가 뭘 만드는지 5줄로 요약해.
2) Step 1~5 구현 계획을 단계별로 짧게 세워. 각 단계에서 만들거나 고칠 파일 이름을 적어.
3) 문서끼리 서로 안 맞는 부분이 있으면 목록으로 알려줘.
아직 코드는 쓰지 마.
```

- 계획 모드로 보내면 더 좋다. Claude Code는 화면 아래 plan mode on이 보일 때까지 Shift+Tab(보통 세 번) 또는 프롬프트 앞에 `/plan`, Codex는 프롬프트 앞에 `/plan`.
- 확인 1: 요약이 PRD랑 다르면 여기서 바로 잡는다. 나중에 잡으면 비싸다.
- 확인 2: "로그인 대신 역할 전환"(API.md 1번)을 이해했는지 본다. 로그인을 만들겠다고 하면 바로 잡는다.
- 확인 3: 3번에서 문서 불일치가 나오면 **문서를 먼저 고치고** Step 1로 간다.

---

## Step 1. 화면만 (가짜 데이터)

```
Step 1만 해.
- docs/API.md 5번, 6번을 보고 Deal, ChecklistItem, Report 타입을 lib/types.ts에 만들어.
- lib/roadmap.ts에 단계 목록과 단계별 체크리스트 템플릿, 자료 발급처 안내를 만들어.
- docs/DESIGN.md 규칙대로 화면을 만들어. 내가 고른 프리셋은 DESIGN.md 8번에 있어.
  - app/deals/new/page.tsx: 거래방 만들기 폼
  - app/deals/[id]/page.tsx: 로드맵(components/Roadmap.tsx), 체크리스트(components/Checklist.tsx), 메시지 영역
  - app/deals/[id]/report/page.tsx: 검증 리포트(components/ReportView.tsx)
  - components/RoleSwitch.tsx: 헤더의 양도인/양수인 보기 전환. 선택값은 localStorage에 저장.
- 아직 API가 없으니까 전부 가짜 데이터로 보여줘. 가짜 리포트는 docs/PROMPTS.md의 샘플 자료 정답 숫자를 써서 POS 6월이 '확인 필요'로 보이게 해.
끝나면 바뀐 파일 목록, 브라우저에서 확인하는 방법, 코드 실행 순서를 3줄로 알려줘.
```

- 확인 1: `npm run dev` → http://localhost:3000/deals/new → 폼이 보인다.
- 확인 2: `/deals/test`에서 로드맵·체크리스트가 보이고, 역할을 바꾸면 체크리스트가 양도인용/양수인용으로 바뀐다.
- 확인 3: `/deals/test/report`에서 요약 카드 → 확인 필요 항목 → 월별 매출표 순서로 보이고, 협상 포인트는 양수인으로 볼 때만 보인다.
- 확인 4: 브라우저 폭을 375px로 줄여도 가로 스크롤이 안 생긴다 (개발자도구 > 기기 모드).
- 이해 질문: `RoleSwitch에서 고른 역할은 어디에 저장되고, 다른 컴포넌트는 그 값을 어떻게 알아? 새로고침하면 왜 유지돼?`
- 커밋: `git add . && git commit -m "step1: UI with mock data"`

---

## Step 2. 자료 판독 + 검증 (OpenAI 연결, 저장 없이)

준비 (사람이 직접): `.env.local`에 `OPENAI_API_KEY`, `OPENAI_MODEL` 넣고 저장. 터미널에 `Reload env`가 안 뜨면 dev 서버 재시작. `npm install openai xlsx`.

```
Step 2만 해. docs/API.md 6번대로:
- lib/prepare.ts에 detectKind()와 파일 변환을 만들어. 맨 위에 import "server-only".
  엑셀은 xlsx로 CSV 텍스트, CSV는 UTF-8 실패 시 EUC-KR, PDF는 input_file, 이미지는 input_image.
- lib/extraction-schema.ts, lib/summary-schema.ts를 만들어 (strict 규칙 지켜).
- lib/openai.ts에 extractDocuments(), summarizeReport()를 만들어. 맨 위에 import "server-only".
- lib/verify.ts에 API.md 6번 "2단계: 코드 검증 규칙"을 그대로 구현해. 여기서는 AI를 부르지 마.
- 이번 단계는 Supabase가 없으니까, 임시로 app/api/verify-test/route.ts를 만들어.
  multipart로 files를 받아서 prepare → extract → verify → summarize 결과 Report를 바로 돌려줘.
- 리포트 화면에 "임시: 파일로 검증해보기" 업로드 칸을 달아서 이 API를 부르게 해. 로딩/에러 상태는 DESIGN.md 6번대로.
끝나면 바뀐 파일 목록, 확인 방법, 실행 순서를 알려줘.
```

- 확인 1: `samples/` 4개 파일을 올리면 진짜 리포트가 뜨고, **POS 6월이 '확인 필요'**로 표시된다.
- 확인 2: 카드매출 6개월 합계가 151,500,000원, 부가세 과세표준이 195,000,000원으로 읽혔는지 원본 JSON에서 확인한다.
- 확인 3: 배달앱 CSV의 한글(정산월, 주문건수)이 깨지지 않았다 (EUC-KR 처리 확인).
- 확인 4: 브라우저 개발자도구 > Network 탭 > `verify-test` 요청을 눌러 본다. 요청과 응답 어디에도 `.env.local`의 `OPENAI_API_KEY` 값이 없어야 한다.
- 확인 5: 확장자를 `.pdf`로 바꾼 텍스트 파일이나 `.hwp` 파일을 올리면 친절한 에러 메시지가 뜬다.
- 이해 질문: `AI가 숫자를 읽고, 비교·등급 계산은 lib/verify.ts가 하는 이유가 뭐야? 만약 AI에게 "POS랑 카드 비교해서 등급 매겨줘"까지 시키면 어떤 문제가 생길 수 있어?`
- 커밋: `git add . && git commit -m "step2: AI extraction and verification"`

---

## Step 3. Supabase 저장 + 거래방 목록 + 자료 업로드

준비 (사람이 직접, AI한테 시키지 말 것):
1. Supabase 대시보드 > SQL Editor > `supabase/schema.sql` 내용 전체 붙여넣고 Run
   (schema.sql이 아직 없으면 먼저 AI에게 "docs/API.md 5번대로 supabase/schema.sql만 만들어. 실행은 내가 해."라고 시킨다)
2. Table Editor에서 `deals`, `checklist_items`, `documents`, `messages`, `reports` 테이블이 생겼는지 확인
3. Storage에서 `deal-documents` 버킷이 생겼고 **Public이 꺼져 있는지** 확인
4. `.env.local`에 `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 넣고 저장 (`Reload env`가 안 뜨면 dev 서버 재시작). `npm install @supabase/supabase-js`.

```
Step 3만 해. docs/API.md 4번, 5번대로:
- lib/supabase.ts에 getSupabase()를 만들어. 맨 위에 import "server-only", secret 키 사용.
- lib/role.ts에 getRole(request)를 만들어. x-role 헤더가 buyer/seller가 아니면 400.
- 브라우저의 모든 fetch에 x-role 헤더를 붙이는 작은 함수를 만들어서 써.
- POST/GET /api/deals, GET /api/deals/[id]를 만들고, 거래방 만들기 폼과 /deals 목록, 거래방 화면을 진짜 데이터로 바꿔.
- POST /api/deals/[id]/documents로 체크리스트 항목별 업로드를 만들어 (Storage에 저장).
- POST /api/deals/[id]/verify와 GET /api/deals/[id]/report를 만들고, Step 2의 lib 함수들을 그대로 재사용해.
- Step 2의 임시 app/api/verify-test와 임시 업로드 칸은 지워.
- 빈 상태/에러 상태/권한 없음 상태도 DESIGN.md 6번대로 처리해.
끝나면 바뀐 파일 목록, 확인 방법, 실행 순서를 알려줘.
```

- 확인 1: 거래방을 만들고 Supabase Table Editor를 새로고침하면 `deals`에 1줄, `checklist_items`에 여러 줄이 보인다.
- 확인 2: `/deals`에 목록이 뜨고, 새로고침해도 남아 있다.
- 확인 3: 양도인으로 바꿔 샘플 자료를 올리면 Storage 버킷에 파일이 보이고 체크리스트가 '제출 완료'로 바뀐다.
- 확인 4: 검증을 돌리면 `reports`에 1줄이 생기고, 새로고침해도 리포트가 남아 있다.
- 확인 5: 양도인으로 볼 때 리포트에 **협상 포인트가 안 보인다.** Network 탭 응답 JSON에도 `negotiation_points`가 없어야 한다 (화면에서만 숨기면 안 된다).
- 이해 질문: `secret 키를 'use client' 파일에서 쓰면 무슨 일이 생겨? 지금 테이블과 버킷의 RLS는 어떤 상태고, 왜 그렇게 해도 우리 앱은 동작해? 그리고 x-role 헤더 방식은 왜 시연용일 뿐이야?`
- 커밋: `git add . && git commit -m "step3: save deals, documents, reports to Supabase"`

---

## Step 4. 거래 진행 관리 (동의, 로드맵 진행, 메시지)

```
Step 4만 해. docs/API.md 4번대로:
- PATCH /api/deals/[id]로 양도인의 자료 공개·AI 분석 동의/철회를 만들어.
  동의 전에는 업로드와 검증이 403이고, 양수인에게 자료 목록이 빈 배열로 가야 해.
- PATCH /api/deals/[id]/checklist/[itemId]를 만들고, lib/roadmap.ts에 advanceStage()를 만들어서
  한 단계의 항목이 모두 끝나면 다음 단계로 자동 진행되게 해.
- 단계가 바뀌거나 리포트가 나오면 messages에 role='agent'로 안내 메시지를 넣어.
- GET/POST /api/deals/[id]/messages를 만들고, components/Messages.tsx는 3초마다 ?after=로 새 메시지만 가져와.
먼저 계획(바꿀 파일과 이유)만 보여주고, 내가 OK 하면 구현해.
```

- 확인 1: 동의 전에 양도인으로 업로드하면 "자료 공개에 먼저 동의해주세요"가 뜬다.
- 확인 2: 동의 → 자료 제출 → 검증 순서로 진행하면 로드맵의 현재 단계가 저절로 넘어가고, 에이전트 메시지가 쌓인다.
- 확인 3: 브라우저 창을 두 개 띄워 하나는 양도인, 하나는 양수인으로 보고 메시지를 보내면 3초 안에 상대 창에 뜬다.
- 확인 4: 동의를 철회하면 양수인 화면에서 자료 목록이 사라진다.
- 이해 질문: `advanceStage()는 언제, 어느 파일에서 불려? 체크리스트 하나를 체크한 순간부터 로드맵이 다음 단계로 바뀌어 화면에 보일 때까지 실행 순서를 번호 매겨서 설명해. 브라우저와 서버를 구분해서.`
- 커밋: `git add . && git commit -m "step4: consent, roadmap progress, messages"`

---

## Step 5. 내 버전

```
docs/PRD.md 8번 "내 버전"에 내가 채운 것만 구현해.
- 8-3 핵심 위험 Top 3는 docs/API.md "내 버전 섹션 추가하는 법" 순서를 따라.
- 8-4 샘플 자료로 시연하기는 docs/API.md의 POST /api/demo대로 만들어. 거래방 목록 화면 위쪽에 버튼을 달아.
먼저 계획(바꿀 파일과 이유)만 보여주고, 내가 OK 하면 구현해.
```

- 확인 1: "샘플 자료로 시연하기"를 누르면 1분 안에 '샘플분식' 리포트 화면으로 이동한다.
- 확인 2: 리포트 요약 카드 아래에 핵심 위험이 최대 3개 보이고, **1번이 POS 6월 매출**이며 근거에 파일명과 숫자가 있다.
- 확인 3: 핵심 위험에 나온 숫자가 월별 매출표의 숫자와 같다 (AI가 숫자를 지어내지 않았는지).
- 커밋: `git add . && git commit -m "step5: my version - top risks, demo button"` 그리고 `git push`

시간 남으면: 조건 합의(`/deals/[id]/terms`), 권리금 계약서 PDF (PRD 4번 P1).

---

## 막혔을 때 쓰는 프롬프트

### 에러가 났다
```
아래 에러가 났다. 고치기 전에 원인을 먼저 설명해. 어느 파일 몇 번째 줄 문제인지, 왜 그런지.
그다음 최소한으로만 고쳐. 관련 없는 파일은 건드리지 마.

[브라우저 에러 화면 또는 빨간 박스 메시지]
[npm run dev 터미널에 찍힌 로그]
```
에러 메시지는 화면에 보이는 것과 터미널에 찍힌 것 둘 다 붙인다. 서버 에러는 터미널에만 찍힌다.

### 검증 결과 숫자가 이상하다
```
샘플 자료로 검증했는데 결과가 docs/PROMPTS.md의 샘플 자료 정답과 다르다: (다른 점)
고치기 전에 원인이 어느 단계인지 먼저 찾아.
1) prepare.ts 변환 결과 2) AI가 읽은 extraction 3) verify.ts 계산 중 어디서 틀렸는지
각 단계의 실제 값을 보여주고 설명해. 그다음 그 단계만 고쳐.
```
AI가 숫자를 잘못 읽은 거면 프롬프트(`instructions`)를, 계산이 틀린 거면 `lib/verify.ts`를 고친다. 섞어서 고치게 두지 않는다.

### AI가 갑자기 너무 많이 바꿨다
```
git status
git diff
git restore .
```
마지막 커밋으로 돌아간다. 그다음 요청을 더 작게 쪼개서 다시 시킨다.

### 코드가 이해가 안 된다
```
방금 바꾼 코드를 Next.js 처음 하는 사람한테 설명하듯 설명해.
파일별로 3줄 이내, 비유 하나 써도 됨. 그리고 내가 이해했는지 확인할 질문 하나 내줘.
```

### AI가 문서랑 다르게 만든다
```
docs/API.md 몇 번 항목과 지금 코드가 다르다: (다른 점)
문서가 기준이다. 문서대로 고쳐.
```
문서가 틀린 거라면 문서를 먼저 고치고 다시 시킨다. 코드만 고치면 다음 Step에서 AI가 또 문서대로 되돌린다.

### AI가 패키지를 더 깔자고 한다
```
docs/API.md 7번에 있는 패키지만 쓴다. 새 패키지 없이 하는 방법으로 다시 해.
```
`zod`, `shadcn`, `pdf-parse`, `iconv-lite`, `@supabase/ssr` 등은 이번에 쓰지 않는다.
