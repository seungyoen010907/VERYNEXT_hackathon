# PROMPTS: 단계별로 AI에게 시키는 법

> 바이브 코딩의 핵심은 "한 번에 다 시키지 않기"다. Step 하나 시키고 -> 직접 눈으로 확인하고 -> 이해 질문 하나 던지고 -> 커밋. 이 루프를 4번 돈다.
> Claude Code는 `claude`, Codex는 `codex`로 프로젝트 폴더에서 실행한다. 둘 다 `AGENTS.md`를 읽는다 (Claude Code는 `CLAUDE.md`를 통해).

## 루프

```
문서 확인 -> 프롬프트 -> AI 구현 -> 내가 직접 확인 -> 이해 질문 -> git commit
```

AI가 "다 됐습니다"라고 해도 믿지 마라. 확인은 내가 한다. 브라우저에서 눌러 보고, 터미널 로그 보고, Supabase 화면 열어 본다.

---

## Step 0. 계획 세우기 (코드 0줄)

```
docs/PRD.md, docs/DESIGN.md, docs/API.md, AGENTS.md를 읽어.
1) 이 프로젝트가 뭘 만드는지 5줄로 요약해.
2) Step 1~4 구현 계획을 단계별로 짧게 세워. 각 단계에서 만들거나 고칠 파일 이름을 적어.
아직 코드는 쓰지 마.
```

- 계획 모드로 보내면 더 좋다. Claude Code는 화면 아래 plan mode on이 보일 때까지 Shift+Tab(보통 세 번) 또는 프롬프트 앞에 `/plan`, Codex는 프롬프트 앞에 `/plan`.
- 확인: 요약이 PRD랑 다르면 여기서 바로 잡는다. 나중에 잡으면 비싸다.

---

## Step 1. 화면만 (가짜 데이터)

```
Step 1만 해.
- docs/API.md 6번의 Spec 타입을 lib/types.ts에 만들어.
- docs/DESIGN.md 규칙대로 app/page.tsx에 입력 폼, components/SpecView.tsx에 결과 카드를 만들어. 내가 고른 프리셋은 DESIGN.md 8번에 있어.
- 아직 API가 없으니까, 버튼을 누르면 1초 뒤에 그럴듯한 가짜 Spec 데이터를 보여줘.
끝나면 바뀐 파일 목록, 브라우저에서 확인하는 방법, 코드 실행 순서를 3줄로 알려줘.
```

- 확인: `npm run dev` -> http://localhost:3000 -> 입력하고 버튼 -> 1초 뒤 카드가 뜬다.
- 이해 질문: `app/page.tsx 맨 위 "use client"는 왜 있어? 지우면 어떤 에러가 나고 왜 나?`
- 커밋: `git add . && git commit -m "step1: UI with mock data"`

---

## Step 2. OpenAI 연결

준비 (사람이 직접): `.env.local`에 `OPENAI_API_KEY`, `OPENAI_MODEL` 넣고 저장. 터미널에 `Reload env`가 안 뜨면 dev 서버 재시작.

```
Step 2만 해. docs/API.md 4번, 6번대로:
- lib/spec-schema.ts에 Spec JSON Schema를 만들어 (strict 규칙 지켜).
- lib/openai.ts에 generateSpec(input)을 만들어. 맨 위에 import "server-only".
- app/api/specs/route.ts에 POST를 만들어. 이번 단계에서는 Supabase 저장 없이 { spec }만 돌려줘.
- app/page.tsx의 가짜 데이터를 지우고 fetch("/api/specs")로 바꿔. 로딩/에러 상태는 DESIGN.md 6번대로.
끝나면 바뀐 파일 목록, 확인 방법, 실행 순서를 알려줘.
```

- 확인 1: 진짜 PRD가 뜬다.
- 확인 2: 브라우저 개발자도구 > Network 탭 > `specs` 요청을 눌러 본다. 요청과 응답 어디에도 `sk-`로 시작하는 키가 없어야 한다.
- 확인 3: `npm run dev` 터미널에 `POST /api/specs 201` 같은 로그가 찍힌다. 이게 서버에서 돈 코드다.
- 이해 질문: `버튼을 누른 순간부터 카드가 뜰 때까지, 어떤 파일의 어떤 함수가 어떤 순서로 실행되는지 번호 매겨서 설명해. 브라우저에서 도는 것과 서버에서 도는 것을 구분해서.`
- 커밋: `git add . && git commit -m "step2: generate PRD with OpenAI"`

---

## Step 3. Supabase 저장 + 목록

준비 (사람이 직접, AI한테 시키지 말 것):
1. Supabase 대시보드 > SQL Editor > `supabase/schema.sql` 내용 전체 붙여넣고 Run
2. Table Editor에서 `specs` 테이블이 생겼는지 확인
3. `.env.local`에 `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 넣고 저장 (`Reload env`가 안 뜨면 dev 서버 재시작)

```
Step 3만 해. docs/API.md 4번, 5번대로:
- lib/supabase.ts에 getSupabase()를 만들어. 맨 위에 import "server-only", secret 키 사용.
- POST /api/specs가 생성 결과를 specs 테이블에 저장하고 { id, created_at, spec }을 돌려주게 바꿔.
- GET /api/specs와 app/specs/page.tsx 목록 페이지를 만들어. 빈 상태/에러 상태도 처리해.
- 메인 헤더에 "내 PRD 목록" 링크를 달아.
끝나면 바뀐 파일 목록, 확인 방법, 실행 순서를 알려줘.
```

- 확인 1: PRD를 하나 만들고 Supabase Table Editor를 새로고침하면 row가 보인다.
- 확인 2: `/specs`에 목록이 뜨고, 새로고침해도 남아 있다.
- 이해 질문: `secret 키를 'use client' 파일에서 쓰면 무슨 일이 생겨? 지금 specs 테이블의 RLS는 어떤 상태고, 왜 그렇게 해도 우리 앱은 동작해?`
- 커밋: `git add . && git commit -m "step3: save to Supabase and list"`

---

## Step 4. 내 버전

```
docs/PRD.md 8번 "내 버전"에 내가 채운 것만 구현해.
출력 섹션을 추가하는 거면 docs/API.md "내 버전 섹션 추가하는 법" 순서를 따라.
먼저 계획(바꿀 파일과 이유)만 보여주고, 내가 OK 하면 구현해.
```

- 확인: PRD 8번에 적은 완료 기준
- 커밋: `git add . && git commit -m "step4: my version - (기능 이름)"` 그리고 `git push`

시간 남으면: 마크다운 복사, `/specs/[id]` 상세/삭제 (PRD 4번 P1).

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
