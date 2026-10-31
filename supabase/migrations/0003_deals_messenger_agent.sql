-- =============================================================================
-- 매물 탐색 · 거래 워크스페이스 · 거래 메신저 · AI 거래 분석
-- 0001·0002의 기존 테이블은 변경하지 않고 컬럼 추가와 새 테이블만 만든다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 매물 공개 정보 (stores 확장)
-- -----------------------------------------------------------------------------
create type public.listing_status as enum ('open', 'negotiating', 'closed');

alter table public.stores
  add column listing_status public.listing_status not null default 'open',
  add column facility_description text not null default '' check (char_length(facility_description) <= 3000),
  add column deal_conditions text not null default '' check (char_length(deal_conditions) <= 3000),
  add column disclose_financials boolean not null default true,
  add column cover_image_path text;

create index stores_listing_idx on public.stores (is_published, listing_status, created_at desc);

-- 알림 설정
alter table public.users
  add column notification_prefs jsonb not null default '{"messages": true, "ai": true, "requests": true}'::jsonb
    check (jsonb_typeof(notification_prefs) = 'object');
grant update (notification_prefs) on public.users to authenticated;

-- -----------------------------------------------------------------------------
-- 거래 (매물 1개 + 양도인 1명 + 양수인 1명). 같은 조합의 중복 거래를 막는다.
-- -----------------------------------------------------------------------------
create type public.deal_stage as enum (
  'inquiry',      -- 문의
  'negotiation',  -- 거래 협의
  'collecting',   -- 자료 수집
  'diligence',    -- 실사 및 검증
  'terms',        -- 조건 협상
  'contract',     -- 계약 진행
  'completed',    -- 거래 완료
  'cancelled'     -- 거래 중단
);

create table public.deals (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete cascade,
  seller_id        uuid not null references public.users (id) on delete cascade,
  buyer_id         uuid not null references public.users (id) on delete cascade,
  stage            public.deal_stage not null default 'inquiry',
  -- 협의 중인 거래 조건. 시작 시 매물 조건을 복사하고, 변경은 deal_term_changes에 기록한다.
  terms            jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object'),
  ai_auto_run      boolean not null default false,  -- 분석 가능 상태가 되면 자동 실행할지 (기본: 사용자가 실행)
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, buyer_id),
  check (seller_id <> buyer_id)
);

create index deals_seller_idx on public.deals (seller_id, updated_at desc);
create index deals_buyer_idx on public.deals (buyer_id, updated_at desc);

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 거래 메시지 (수정 불가). seq는 AI 분석 범위를 정하는 순번이다.
-- -----------------------------------------------------------------------------
create type public.deal_message_kind as enum ('text', 'file', 'request', 'system');

create table public.deal_messages (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity unique,
  deal_id      uuid not null references public.deals (id) on delete cascade,
  sender_id    uuid references public.users (id) on delete set null,  -- null = 시스템
  kind         public.deal_message_kind not null default 'text',
  body         text not null default '' check (char_length(body) <= 5000),
  document_id  uuid references public.documents (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (kind <> 'file' or document_id is not null)
);

create index deal_messages_deal_seq_idx on public.deal_messages (deal_id, seq);
create index deal_messages_document_idx on public.deal_messages (document_id);

create function public.prevent_row_update()
returns trigger
language plpgsql
as $$
begin
  raise exception '%는 기록 보존을 위해 수정할 수 없습니다 (id=%)', tg_table_name, old.id
    using errcode = 'P0001';
end;
$$;

create trigger deal_messages_immutable
  before update on public.deal_messages
  for each row execute function public.prevent_row_update();

-- 읽음 위치 (읽지 않은 메시지 수 계산)
create table public.deal_reads (
  deal_id        uuid not null references public.deals (id) on delete cascade,
  user_id        uuid not null references public.users (id) on delete cascade,
  last_read_seq  bigint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (deal_id, user_id)
);

-- 메신저로 공유한 파일은 증빙자료(documents)에 저장하고, 어느 거래에서 올렸는지 남긴다
alter table public.documents add column deal_id uuid references public.deals (id) on delete set null;
create index documents_deal_idx on public.documents (deal_id);

-- -----------------------------------------------------------------------------
-- 실사 체크리스트 업무
-- -----------------------------------------------------------------------------
create type public.party_role as enum ('seller', 'buyer');
create type public.deal_task_group as enum ('revenue', 'cost', 'contract', 'operation');
create type public.deal_task_status as enum (
  'not_requested',  -- 미요청
  'requested',      -- 요청 완료
  'submitted',      -- 제출 완료
  'reviewing',      -- 검토 중
  'needs_more',     -- 추가 자료 필요
  'done'            -- 완료
);
create type public.deal_task_source as enum ('template', 'ai', 'user');
create type public.actor_kind as enum ('user', 'ai', 'system');

create table public.deal_tasks (
  id                   uuid primary key default gen_random_uuid(),
  deal_id              uuid not null references public.deals (id) on delete cascade,
  key                  text not null check (char_length(key) between 1 and 60),
  task_group           public.deal_task_group not null,
  title                text not null check (char_length(title) between 1 and 200),
  assignee_role        public.party_role not null,        -- 담당자
  request_target_role  public.party_role,                 -- 제출 요청 대상 (자료가 필요 없는 업무는 null)
  status               public.deal_task_status not null default 'not_requested',
  due_date             date,
  reason               text not null default '',          -- 생성 사유
  source               public.deal_task_source not null default 'template',
  document_type        public.document_type,              -- 연결되는 증빙 종류
  evidence             jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (deal_id, key)
);

create trigger deal_tasks_set_updated_at
  before update on public.deal_tasks
  for each row execute function public.set_updated_at();

create table public.deal_task_events (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.deal_tasks (id) on delete cascade,
  deal_id      uuid not null references public.deals (id) on delete cascade,
  actor_kind   public.actor_kind not null,
  actor_id     uuid references public.users (id) on delete set null,
  from_status  public.deal_task_status,
  to_status    public.deal_task_status,
  note         text not null default '',
  evidence     jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  created_at   timestamptz not null default now(),
  -- AI·시스템이 상태를 바꿀 때는 근거가 반드시 있어야 한다
  check (actor_kind = 'user' or jsonb_array_length(evidence) > 0)
);

create index deal_task_events_task_idx on public.deal_task_events (task_id, created_at);

-- -----------------------------------------------------------------------------
-- AI 거래 분석 실행 기록과 위험 항목
-- -----------------------------------------------------------------------------
create type public.ai_run_trigger as enum ('messages', 'documents', 'both');
create type public.finding_status as enum ('open', 'resolved');

create table public.deal_ai_runs (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  requested_by  uuid references public.users (id) on delete set null,
  trigger       public.ai_run_trigger not null,
  from_seq      bigint,   -- 이번 분석에서 새로 본 메시지 범위 (from_seq < seq <= to_seq)
  to_seq        bigint,
  document_ids  jsonb not null default '[]'::jsonb check (jsonb_typeof(document_ids) = 'array'),
  input_hash    text not null,  -- 같은 입력이면 다시 분석하지 않는다
  provider      text not null,
  summary       text not null,
  result        jsonb not null, -- 주장·합의·질문·자료 요청·조치·단계 제안·누적 요약
  created_at    timestamptz not null default now(),
  unique (deal_id, input_hash)
);

create index deal_ai_runs_deal_idx on public.deal_ai_runs (deal_id, created_at desc);

create table public.deal_ai_findings (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references public.deals (id) on delete cascade,
  key              text not null,   -- 같은 위험을 분석마다 이어서 추적하기 위한 키
  level            public.risk_level not null,
  category         text not null,
  title            text not null,
  detail           text not null,
  -- fact(확인된 사실) / suspicion(의심) / needs_check(추가 확인 필요)
  certainty        text not null check (certainty in ('fact', 'suspicion', 'needs_check')),
  evidence         jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  status           public.finding_status not null default 'open',
  first_run_id     uuid not null references public.deal_ai_runs (id) on delete cascade,
  last_run_id      uuid not null references public.deal_ai_runs (id) on delete cascade,
  resolved_run_id  uuid references public.deal_ai_runs (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (deal_id, key)
);

create trigger deal_ai_findings_set_updated_at
  before update on public.deal_ai_findings
  for each row execute function public.set_updated_at();

-- AI에게 한 질문과 답변. 질문한 사람만 볼 수 있다.
create table public.deal_ai_messages (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        public.chat_role not null,
  content     text not null check (char_length(content) between 1 and 10000),
  cited       jsonb not null default '[]'::jsonb check (jsonb_typeof(cited) = 'array'),
  created_at  timestamptz not null default now()
);

create index deal_ai_messages_idx on public.deal_ai_messages (deal_id, user_id, created_at);

-- -----------------------------------------------------------------------------
-- 거래 타임라인, 조건 변경 이력, 비공개 메모, 거래 보고서
-- -----------------------------------------------------------------------------
create type public.deal_event_type as enum (
  'deal_started',
  'stage_changed',
  'task_status_changed',
  'request_sent',
  'file_shared',
  'document_analyzed',
  'ai_analysis_completed',
  'ai_risk_found',
  'ai_risk_resolved',
  'terms_changed',
  'report_generated'
);

create table public.deal_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  actor_kind  public.actor_kind not null,
  actor_id    uuid references public.users (id) on delete set null,
  type        public.deal_event_type not null,
  title       text not null check (char_length(title) between 1 and 300),
  detail      jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at  timestamptz not null default now()
);

create index deal_events_deal_idx on public.deal_events (deal_id, created_at desc);

create trigger deal_events_immutable
  before update on public.deal_events
  for each row execute function public.prevent_row_update();

create table public.deal_term_changes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  field       text not null,
  old_value   jsonb,
  new_value   jsonb,
  changed_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index deal_term_changes_idx on public.deal_term_changes (deal_id, created_at desc);

create trigger deal_term_changes_immutable
  before update on public.deal_term_changes
  for each row execute function public.prevent_row_update();

-- 상대방에게 보이지 않는 개인 메모 (AI 분석에도 사용하지 않는다)
create table public.deal_private_notes (
  deal_id     uuid not null references public.deals (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 10000),
  updated_at  timestamptz not null default now(),
  primary key (deal_id, user_id)
);

create table public.deal_reports (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  content       jsonb not null,
  generated_by  uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index deal_reports_idx on public.deal_reports (deal_id, created_at desc);

-- =============================================================================
-- RLS: 거래 데이터는 거래 당사자만 접근한다
-- =============================================================================
create function public.is_deal_party(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.deals
    where id = p_deal_id and (seller_id = auth.uid() or buyer_id = auth.uid())
  );
$$;

-- 정책끼리 서로의 테이블을 조회하면 RLS가 재귀하므로, 교차 조회는 security definer 함수로 감싼다
create function public.can_start_deal(p_store_id uuid, p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.stores where id = p_store_id and is_published and owner_id = p_seller_id);
$$;

create function public.is_store_deal_buyer(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.deals where store_id = p_store_id and buyer_id = auth.uid());
$$;

create function public.is_shared_with_buyer(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.deal_messages m join public.deals d on d.id = m.deal_id
    where m.document_id = p_document_id and d.buyer_id = auth.uid()
  );
$$;

alter table public.deals              enable row level security;
alter table public.deal_messages      enable row level security;
alter table public.deal_reads         enable row level security;
alter table public.deal_tasks         enable row level security;
alter table public.deal_task_events   enable row level security;
alter table public.deal_ai_runs       enable row level security;
alter table public.deal_ai_findings   enable row level security;
alter table public.deal_ai_messages   enable row level security;
alter table public.deal_events        enable row level security;
alter table public.deal_term_changes  enable row level security;
alter table public.deal_private_notes enable row level security;
alter table public.deal_reports       enable row level security;

create policy deals_party_select on public.deals
  for select to authenticated using (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()));
-- 거래 문의는 양수인이 공개 매물에 대해서만 시작한다
create policy deals_buyer_insert on public.deals
  for insert to authenticated
  with check (buyer_id = (select auth.uid()) and public.can_start_deal(store_id, seller_id));

create policy deal_messages_party_select on public.deal_messages
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_messages_party_insert on public.deal_messages
  for insert to authenticated
  with check (public.is_deal_party(deal_id) and sender_id = (select auth.uid()) and kind <> 'system');

create policy deal_reads_own on public.deal_reads
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_deal_party(deal_id));

create policy deal_tasks_party_select on public.deal_tasks
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_task_events_party_select on public.deal_task_events
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_ai_runs_party_select on public.deal_ai_runs
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_ai_findings_party_select on public.deal_ai_findings
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_events_party_select on public.deal_events
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_term_changes_party_select on public.deal_term_changes
  for select to authenticated using (public.is_deal_party(deal_id));
create policy deal_reports_party_select on public.deal_reports
  for select to authenticated using (public.is_deal_party(deal_id));

create policy deal_ai_messages_own on public.deal_ai_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy deal_private_notes_own on public.deal_private_notes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_deal_party(deal_id));

-- 메신저로 공유된 문서는 해당 거래의 양수인도 볼 수 있다 (그 외 원본 문서는 기존대로 소유자만)
create policy documents_deal_shared_select on public.documents
  for select to authenticated
  using (public.is_shared_with_buyer(id));

-- 거래 중인 양수인은 매물이 비공개로 바뀌어도 해당 매물을 계속 볼 수 있다
create policy stores_deal_party_select on public.stores
  for select to authenticated
  using (public.is_store_deal_buyer(id));
