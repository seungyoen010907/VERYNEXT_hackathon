-- 점포 양도양수 계약 관리 에이전트: 테이블 + Storage 버킷 (docs/API.md 5번)
-- Supabase 대시보드 > SQL Editor에 전체 붙여넣고 Run.
-- 여러 번 실행해도 안전하다.

-- 예전 템플릿(PRD 메이커)에서 만든 테이블이 있으면 지운다.
drop table if exists public.specs;

create table if not exists public.deals (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  address                text not null,
  business_type          text not null,
  premium                bigint not null,
  deposit                bigint not null,
  monthly_rent           bigint not null,
  claimed_monthly_sales  bigint not null,
  claimed_monthly_profit bigint,
  stage                  text not null default 'consent',
  seller_consent         boolean not null default false,
  consent_at             timestamptz
);

create table if not exists public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  stage      text not null,
  role       text not null,
  key        text not null,
  title      text not null,
  status     text not null default 'todo',
  sort       int  not null,
  updated_at timestamptz default now()
);

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  checklist_key text not null,
  file_name     text not null,
  storage_path  text not null,
  kind          text not null,
  size          int  not null
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  role       text not null,
  body       text not null
);

create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  grade      text not null,
  result     jsonb not null
);

create index if not exists deals_created_at_idx      on public.deals (created_at desc);
create index if not exists checklist_items_deal_idx  on public.checklist_items (deal_id, sort);
create index if not exists documents_deal_idx        on public.documents (deal_id, created_at);
create index if not exists messages_deal_idx         on public.messages (deal_id, created_at);
create index if not exists reports_deal_idx          on public.reports (deal_id, created_at desc);

-- RLS를 켜고 정책(policy)은 하나도 만들지 않는다.
-- => publishable 키로는 이 테이블들을 읽지도 쓰지도 못한다.
-- => 우리 서버는 secret 키로 접속하는데, 이 키는 RLS를 우회한다.
alter table public.deals           enable row level security;
alter table public.checklist_items enable row level security;
alter table public.documents       enable row level security;
alter table public.messages        enable row level security;
alter table public.reports         enable row level security;

-- 2026-05-30 이후 만든 프로젝트는 새 테이블이 API에 자동 노출되지 않는다.
-- 이 grant가 없으면 "42501 permission denied for table deals" 에러가 난다.
grant select, insert, update, delete on
  public.deals, public.checklist_items, public.documents, public.messages, public.reports
  to service_role;

-- Storage: 비공개(private) 버킷. 파일 하나 10MB까지.
insert into storage.buckets (id, name, public, file_size_limit)
values ('deal-documents', 'deal-documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- =====================================================================
-- 확장 (docs/API.md 10.2): 매물·데이터룸·권한·NDA·에이전트 간 통신
-- 기존 테이블은 지우지 않고 칸만 더한다. 여러 번 실행해도 안전하다.
-- =====================================================================

-- 데모 사용자 (실제 로그인 대신. 시연용)
create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  roles      text[] not null default '{}',
  is_sample  boolean not null default false
);

insert into public.users (id, name, roles, is_sample) values
  ('00000000-0000-0000-0000-00000000000a', '양도인 A', '{seller}', true),
  ('00000000-0000-0000-0000-00000000000b', '양도인 B', '{seller}', true),
  ('00000000-0000-0000-0000-00000000000c', '양도인 C', '{seller}', true),
  ('00000000-0000-0000-0000-0000000000b1', '양수인', '{buyer}', true)
on conflict (id) do update set name = excluded.name;

-- deals = 매물(Listing)로 확장
alter table public.deals add column if not exists seller_id         uuid references public.users(id);
alter table public.deals add column if not exists building_name     text;
alter table public.deals add column if not exists business_name     text;
alter table public.deals add column if not exists floor             int;
alter table public.deals add column if not exists total_floors      int;
alter table public.deals add column if not exists area_pyeong       numeric;
alter table public.deals add column if not exists is_franchise      boolean;
alter table public.deals add column if not exists premium_breakdown jsonb;
alter table public.deals add column if not exists themes            text[] not null default '{}';
alter table public.deals add column if not exists parking           jsonb;
alter table public.deals add column if not exists status            text not null default 'draft';
alter table public.deals add column if not exists is_sample         boolean not null default false;

-- documents 확장: 분류, 공개 등급(원본/요약 따로), 추출 결과 저장(재분석 방지), 검증 상태
alter table public.documents add column if not exists category             text not null default 'other';
alter table public.documents add column if not exists access_level         text not null default 'L3';
alter table public.documents add column if not exists summary_access_level text not null default 'L3';
alter table public.documents add column if not exists extraction           jsonb;
alter table public.documents add column if not exists verification_status  text not null default 'submitted';
alter table public.documents add column if not exists updated_at           timestamptz not null default now();

-- messages 확장: 매물별 양도인·양수인 대화방 구분
alter table public.messages add column if not exists buyer_id uuid references public.users(id);

-- 추출된 값 하나하나 (원본 자료와 연결)
create table if not exists public.data_points (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  listing_id   uuid not null references public.deals(id) on delete cascade,
  document_id  uuid references public.documents(id) on delete cascade,
  key          text not null,
  period       text,
  value        numeric,
  unit         text not null default 'KRW',
  trust_level  text not null,
  access_level text not null default 'L3',
  source_note  text
);

create table if not exists public.buyer_profiles (
  user_id               uuid primary key references public.users(id) on delete cascade,
  updated_at            timestamptz not null default now(),
  budget_total          bigint,
  regions               text[] not null default '{}',
  business_types        text[] not null default '{}',
  target_monthly_profit bigint,
  weekly_hours          int,
  experience            text,
  payback_months        int,
  notes                 text
);

-- NDA: 테스트 동의만 기록한다 (법적 전자서명 아님)
create table if not exists public.ndas (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.deals(id) on delete cascade,
  buyer_id   uuid not null references public.users(id) on delete cascade,
  version    text not null,
  status     text not null default 'test_agreed',
  agreed_at  timestamptz not null default now(),
  revoked_at timestamptz,
  unique (listing_id, buyer_id)
);

create table if not exists public.access_grants (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  listing_id  uuid not null references public.deals(id) on delete cascade,
  buyer_id    uuid not null references public.users(id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  status      text not null default 'requested',
  reason      text,
  decided_at  timestamptz,
  expires_at  timestamptz,
  unique (listing_id, buyer_id, target_type, target_id)
);

create table if not exists public.agent_tasks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  buyer_id    uuid not null references public.users(id) on delete cascade,
  listing_ids uuid[] not null,
  status      text not null default 'running'
);

create table if not exists public.agent_messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  task_id       uuid references public.agent_tasks(id) on delete set null,
  listing_id    uuid not null references public.deals(id) on delete cascade,
  buyer_id      uuid not null references public.users(id) on delete cascade,
  question_type text not null,
  topic         text not null,
  question      text not null,
  status        text not null default 'created',
  answer_type   text,
  answer        text,
  evidence      jsonb not null default '[]',
  grant_id      uuid references public.access_grants(id) on delete set null,
  dedupe_key    text not null unique,
  ai_used       boolean not null default false,
  error         text
);

create table if not exists public.comparison_reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  buyer_id    uuid not null references public.users(id) on delete cascade,
  listing_ids uuid[] not null,
  criteria    jsonb not null,
  result      jsonb not null
);

create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id   uuid references public.users(id) on delete set null,
  action     text not null,
  listing_id uuid references public.deals(id) on delete cascade,
  target     text
);

create index if not exists data_points_listing_idx    on public.data_points (listing_id, key);
create index if not exists access_grants_listing_idx  on public.access_grants (listing_id, status);
create index if not exists agent_messages_task_idx    on public.agent_messages (task_id, listing_id);
create index if not exists agent_messages_buyer_idx   on public.agent_messages (buyer_id, created_at desc);
create index if not exists audit_logs_listing_idx     on public.audit_logs (listing_id, created_at desc);

-- 새 테이블도 RLS를 켜고 정책은 만들지 않는다 (서버만 secret 키로 접근)
alter table public.users              enable row level security;
alter table public.data_points        enable row level security;
alter table public.buyer_profiles     enable row level security;
alter table public.ndas               enable row level security;
alter table public.access_grants      enable row level security;
alter table public.agent_tasks        enable row level security;
alter table public.agent_messages     enable row level security;
alter table public.comparison_reports enable row level security;
alter table public.audit_logs         enable row level security;

grant select, insert, update, delete on
  public.users, public.data_points, public.buyer_profiles, public.ndas, public.access_grants,
  public.agent_tasks, public.agent_messages, public.comparison_reports, public.audit_logs
  to service_role;

-- =====================================================================
-- 거래방 (PRD 11.2): 매물 × 양수인 한 쌍마다 체크리스트와 메시지를 따로 둔다.
-- 지금 단계는 칸으로 저장하지 않고 체크리스트에서 계산한다 (lib/deals.ts).
-- =====================================================================
alter table public.checklist_items add column if not exists buyer_id uuid references public.users(id) on delete cascade;
create unique index if not exists checklist_items_room_key_idx on public.checklist_items (deal_id, buyer_id, key);
create index if not exists messages_room_idx on public.messages (deal_id, buyer_id, created_at);

-- =====================================================================
-- F08 수익성·권리금 분석 (docs/API.md 11번): 양도인 입력값
-- 비용·시설 입력은 파일 없는 데이터룸 항목(documents.kind = 'input')에 data_points로 붙인다.
-- =====================================================================
alter table public.deals add column if not exists maintenance_fee            bigint;
alter table public.deals add column if not exists lease_remaining_months     int;
alter table public.deals add column if not exists claimed_monthly_cash_sales bigint;
alter table public.data_points add column if not exists meta jsonb;
notify pgrst, 'reload schema';
