-- =============================================================================
-- AI 점포 양도양수 실사 에이전트 - 초기 스키마
--
-- 설계 원칙
--  1. 금액은 모두 원(KRW) 단위 정수(bigint)로 저장한다.
--  2. 확인되지 않은 값은 NULL로 저장한다. NULL을 0원으로 간주하지 않는다.
--  3. AI 문서 분석 원본(extracted_data)은 수정할 수 없다. 정규화 결과는 별도 테이블에 저장한다.
--  4. 분석은 실행할 때마다 analyses에 새 행을 만들어 이력을 보존한다.
--  5. 모든 분석 결과는 store_id와 analysis_id에 함께 연결하고,
--     복합 외래키로 두 값이 서로 어긋나지 않도록 강제한다.
--  6. 행 수준 보안(RLS)으로 사용자별 접근 권한을 적용한다.
--     서버의 분석 엔진은 service_role 키로 RLS를 우회해 결과를 기록한다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 열거형(enum)
-- 값을 바꾸면 src/types/domain.ts 도 함께 바꿔야 한다. (테스트가 일치 여부를 검사한다)
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('seller', 'buyer', 'admin');

create type public.store_status as enum (
  'draft',                 -- 작성 중
  'pending_verification',  -- 검증 신청됨
  'verifying',             -- 검증 진행 중
  'verified',              -- 검증 완료
  'needs_more_documents'   -- 추가 자료 요청
);

create type public.document_type as enum (
  'pos_sales',       -- POS 매출 자료
  'card_sales',      -- 카드 매출 자료
  'delivery_sales',  -- 배달앱 매출 및 정산 자료
  'expense',         -- 비용 및 지출 자료
  'lease_contract',  -- 임대차 계약서
  'other'            -- 기타 자료
);

create type public.document_status as enum ('uploaded', 'analyzing', 'analyzed', 'failed');

create type public.analysis_status as enum ('pending', 'running', 'completed', 'failed');

create type public.risk_level as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN');

create type public.risk_category as enum (
  'revenue_mismatch',               -- 매출 불일치
  'insufficient_revenue_evidence',  -- 매출 증빙 부족
  'missing_costs',                  -- 비용 누락
  'profit_exaggeration',            -- 수익성 과장 가능성
  'abnormal_monthly_change',        -- 특정 월 매출 급변
  'period_mismatch',                -- 자료 기간 불일치
  'lease_contract_caution'          -- 계약서상 주의 사항
);

create type public.verification_status as enum (
  'verified',          -- 자료 간 일치
  'mismatch',          -- 자료 간 불일치
  'unverifiable',      -- 집계 기준이 달라 비교 불가
  'insufficient_data'  -- 비교할 자료 없음
);

create type public.revenue_check_type as enum (
  'pos_vs_card',
  'pos_vs_cash',
  'delivery_order_vs_settlement',
  'claimed_vs_evidence',
  'monthly_change',
  'data_completeness'
);

create type public.revenue_source as enum (
  'claimed',              -- 양도인 주장
  'pos',                  -- POS 매출
  'card',                 -- 카드 매출
  'cash',                 -- 현금 매출
  'delivery_order',       -- 배달앱 주문액
  'delivery_settlement'   -- 배달앱 정산액
);

-- 자료마다 집계 기준이 다르면 단순 비교하지 않기 위해 기준을 함께 저장한다.
create type public.aggregation_basis as enum (
  'gross_sales',        -- 총매출(할인·환불 전)
  'net_sales',          -- 순매출(할인·환불 후)
  'order_amount',       -- 주문 금액
  'settlement_amount',  -- 수수료 차감 후 정산 금액
  'unknown'             -- 기준 확인 불가
);

create type public.expense_category as enum (
  'material',      -- 재료비
  'labor',         -- 인건비
  'rent',          -- 임대료
  'maintenance',   -- 관리비
  'utilities',     -- 공과금
  'delivery_fee',  -- 배달 수수료
  'advertising',   -- 광고비
  'other'          -- 기타 비용
);

create type public.verification_level as enum (
  'unverified',  -- 증빙으로 확인된 값 없음
  'partial',     -- 일부 항목만 증빙으로 확인
  'verified'     -- 핵심 항목이 증빙으로 확인
);

create type public.profit_period_type as enum ('monthly', 'average');

create type public.payback_status as enum (
  'calculable',       -- 회수 기간 계산 가능
  'not_recoverable',  -- 월 현금흐름이 0 이하라 회수 불가
  'not_calculable'    -- 필요한 값이 확인되지 않아 계산 불가
);

create type public.chat_role as enum ('user', 'assistant');

-- -----------------------------------------------------------------------------
-- 공통 함수
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. users : Supabase Auth 사용자와 1:1로 연결되는 프로필
-- -----------------------------------------------------------------------------
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  role         public.user_role not null default 'buyer',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- 가입 시 프로필을 자동 생성한다. 메타데이터로는 seller/buyer만 지정할 수 있고 admin은 불가하다.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' in ('seller', 'buyer')
        then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'buyer'::public.user_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. stores : 매물(점포)
-- -----------------------------------------------------------------------------
create table public.stores (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null references public.users (id) on delete cascade,
  name                        text not null check (char_length(name) between 1 and 100),
  industry                    text not null check (char_length(industry) between 1 and 50),
  address                     text not null check (char_length(address) between 1 and 200),
  region                      text not null check (char_length(region) between 1 and 50),
  business_period_months      integer check (business_period_months >= 0),
  deposit                     bigint not null check (deposit >= 0),
  monthly_rent                bigint not null check (monthly_rent >= 0),
  premium                     bigint not null check (premium >= 0),
  claimed_monthly_revenue     bigint check (claimed_monthly_revenue >= 0),
  claimed_monthly_net_profit  bigint,  -- 손실을 주장할 수도 있으므로 음수 허용
  facility_investment         bigint check (facility_investment >= 0),
  other_initial_cost          bigint check (other_initial_cost >= 0),
  description                 text not null default '' check (char_length(description) <= 5000),
  status                      public.store_status not null default 'draft',
  is_published                boolean not null default false,
  is_test_data                boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index stores_owner_id_idx on public.stores (owner_id);
create index stores_industry_idx on public.stores (industry);
create index stores_region_idx on public.stores (region);
create index stores_status_idx on public.stores (status);

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. documents : 업로드한 증빙 자료 (파일 본체는 Supabase Storage에 저장)
-- -----------------------------------------------------------------------------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  uploaded_by    uuid references public.users (id) on delete set null,
  document_type  public.document_type not null,
  file_name      text not null check (char_length(file_name) between 1 and 255),
  storage_path   text not null unique,
  mime_type      text not null check (mime_type in (
                   'application/pdf',
                   'application/vnd.ms-excel',
                   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                   'image/jpeg',
                   'image/png'
                 )),
  file_size      bigint not null check (file_size > 0),
  status         public.document_status not null default 'uploaded',
  period_start   date,
  period_end     date,
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, store_id),
  check (period_start is null or period_end is null or period_start <= period_end)
);

create index documents_store_id_idx on public.documents (store_id);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. extracted_data : AI 문서 분석 결과 원본 (수정 불가)
-- -----------------------------------------------------------------------------
create table public.extracted_data (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null,
  document_id       uuid,  -- 파일 없이 JSON만 들어온 경우 NULL
  provider          text not null check (char_length(provider) between 1 and 50),
  provider_version  text,
  schema_version    text not null,
  raw_payload       jsonb not null,
  received_at       timestamptz not null default now(),
  unique (id, store_id),
  foreign key (store_id) references public.stores (id) on delete cascade,
  foreign key (document_id, store_id) references public.documents (id, store_id) on delete cascade
);

create index extracted_data_store_id_idx on public.extracted_data (store_id);
create index extracted_data_document_id_idx on public.extracted_data (document_id);

create function public.prevent_extracted_data_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'extracted_data는 원본 보존을 위해 수정할 수 없습니다 (id=%)', old.id
    using errcode = 'P0001';
end;
$$;

create trigger extracted_data_immutable
  before update on public.extracted_data
  for each row execute function public.prevent_extracted_data_update();

-- -----------------------------------------------------------------------------
-- 5. normalized_data : 원본을 공통 형식으로 정규화한 결과
-- -----------------------------------------------------------------------------
create table public.normalized_data (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null,
  extracted_data_id  uuid not null,
  schema_version     text not null,
  payload            jsonb not null,
  warnings           jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  created_at         timestamptz not null default now(),
  unique (id, store_id),
  foreign key (store_id) references public.stores (id) on delete cascade,
  foreign key (extracted_data_id, store_id) references public.extracted_data (id, store_id) on delete cascade
);

create index normalized_data_store_id_idx on public.normalized_data (store_id);
create index normalized_data_extracted_data_id_idx on public.normalized_data (extracted_data_id);

-- -----------------------------------------------------------------------------
-- 6. monthly_revenues : 출처별 월 매출
-- normalized_data_id가 NULL이면 증빙 없이 양도인이 직접 입력한 값이다.
-- -----------------------------------------------------------------------------
create table public.monthly_revenues (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  normalized_data_id  uuid,
  source              public.revenue_source not null,
  platform            text,  -- 배달앱 이름 등 (배달의민족, 쿠팡이츠 ...)
  year_month          date not null check (extract(day from year_month) = 1),
  amount              bigint not null check (amount >= 0),
  aggregation_basis   public.aggregation_basis not null default 'unknown',
  vat_included        boolean,  -- NULL = 확인 불가
  includes_card       boolean,  -- POS 금액에 카드 매출이 포함되는지. NULL = 확인 불가
  includes_delivery   boolean,  -- POS 금액에 배달 매출이 포함되는지. NULL = 확인 불가
  order_count         integer check (order_count >= 0),
  created_at          timestamptz not null default now(),
  foreign key (normalized_data_id, store_id) references public.normalized_data (id, store_id) on delete cascade
);

create index monthly_revenues_store_month_idx on public.monthly_revenues (store_id, year_month);
create unique index monthly_revenues_unique_idx
  on public.monthly_revenues (store_id, normalized_data_id, source, year_month, coalesce(platform, ''));

-- -----------------------------------------------------------------------------
-- 7. monthly_expenses : 항목별 월 비용
-- 확인되지 않은 비용은 행을 만들지 않는다. (0원 행 = 실제로 0원임이 확인된 경우)
-- -----------------------------------------------------------------------------
create table public.monthly_expenses (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  normalized_data_id  uuid,
  category            public.expense_category not null,
  year_month          date not null check (extract(day from year_month) = 1),
  amount              bigint not null check (amount >= 0),
  is_verified         boolean not null default false,  -- 증빙 자료로 확인된 값인지
  note                text,
  created_at          timestamptz not null default now(),
  foreign key (normalized_data_id, store_id) references public.normalized_data (id, store_id) on delete cascade
);

create index monthly_expenses_store_month_idx on public.monthly_expenses (store_id, year_month);
create unique index monthly_expenses_unique_idx
  on public.monthly_expenses (store_id, normalized_data_id, category, year_month);

-- -----------------------------------------------------------------------------
-- 8. analyses : 분석 실행 단위 (실행할 때마다 새 행 = 이력 보존)
-- -----------------------------------------------------------------------------
create table public.analyses (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  requested_by        uuid references public.users (id) on delete set null,
  status              public.analysis_status not null default 'pending',
  engine_version      text not null,
  input_snapshot      jsonb not null default '{}'::jsonb,   -- 분석에 사용한 문서·정규화 데이터 ID 목록
  basis               jsonb not null default '{}'::jsonb,   -- 분석 기준 (허용 오차, 기준 기간 등)
  verification_level  public.verification_level,
  missing_data        jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_data) = 'array'),
  summary             text,
  ai_opinion          text,
  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (id, store_id)
);

create index analyses_store_created_idx on public.analyses (store_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 9. revenue_verifications : 매출 교차 검증 결과
-- -----------------------------------------------------------------------------
create table public.revenue_verifications (
  id                uuid primary key default gen_random_uuid(),
  analysis_id       uuid not null,
  store_id          uuid not null,
  check_type        public.revenue_check_type not null,
  status            public.verification_status not null,
  year_month        date check (year_month is null or extract(day from year_month) = 1),
  expected_amount   bigint,
  actual_amount     bigint,
  difference_amount bigint,
  difference_rate   numeric(9, 4),  -- 비율(0.1234 = 12.34%)
  basis             text not null check (char_length(basis) > 0),  -- 판정 기준 설명
  evidence          jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  created_at        timestamptz not null default now(),
  foreign key (analysis_id, store_id) references public.analyses (id, store_id) on delete cascade
);

create index revenue_verifications_analysis_idx on public.revenue_verifications (analysis_id);

-- -----------------------------------------------------------------------------
-- 10. profit_analyses : 수익성 분석 (월별 행 + 평균 행)
-- 비용 컬럼이 NULL이면 확인되지 않은 비용이다. 0원으로 간주하지 않는다.
-- 필수 비용(재료비·인건비·임대료·관리비·공과금, 배달 매출이 있으면 배달 수수료)이 하나라도
-- 확인되지 않으면 영업이익을 계산하지 않는다. 선택 비용(광고비·기타)이 빠지면 영업이익은
-- "확인된 비용 기준 상한값"이며 is_complete = false 로 표시한다.
-- -----------------------------------------------------------------------------
create table public.profit_analyses (
  id                       uuid primary key default gen_random_uuid(),
  analysis_id              uuid not null,
  store_id                 uuid not null,
  period_type              public.profit_period_type not null,
  year_month               date check (year_month is null or extract(day from year_month) = 1),
  total_revenue            bigint check (total_revenue >= 0),
  revenue_basis            text not null,  -- 총매출로 사용한 자료와 이유
  material_cost            bigint check (material_cost >= 0),
  labor_cost               bigint check (labor_cost >= 0),
  rent_cost                bigint check (rent_cost >= 0),
  maintenance_cost         bigint check (maintenance_cost >= 0),
  utilities_cost           bigint check (utilities_cost >= 0),
  delivery_fee             bigint check (delivery_fee >= 0),
  advertising_cost         bigint check (advertising_cost >= 0),
  other_cost               bigint check (other_cost >= 0),
  total_operating_cost     bigint check (total_operating_cost >= 0),
  operating_profit         bigint,
  operating_margin         numeric(9, 4),  -- 퍼센트 값 (12.34 = 12.34%)
  missing_cost_categories  public.expense_category[] not null default '{}',
  is_complete              boolean not null,  -- 모든 비용 항목이 확인됐는지
  created_at               timestamptz not null default now(),
  check ((period_type = 'monthly') = (year_month is not null)),
  foreign key (analysis_id, store_id) references public.analyses (id, store_id) on delete cascade
);

create index profit_analyses_analysis_idx on public.profit_analyses (analysis_id);

-- -----------------------------------------------------------------------------
-- 11. premium_analyses : 권리금 및 투자금 회수 분석
-- 시장 거래 데이터가 없으면 적정 권리금을 확정하지 않는다 (market_data_available = false).
-- -----------------------------------------------------------------------------
create table public.premium_analyses (
  id                        uuid primary key default gen_random_uuid(),
  analysis_id               uuid not null,
  store_id                  uuid not null,
  deposit                   bigint not null check (deposit >= 0),
  premium                   bigint not null check (premium >= 0),
  facility_investment       bigint check (facility_investment >= 0),
  other_initial_cost        bigint check (other_initial_cost >= 0),
  total_initial_investment  bigint check (total_initial_investment >= 0),
  monthly_cash_flow         bigint,
  payback_months            numeric(9, 2) check (payback_months is null or payback_months > 0),
  payback_status            public.payback_status not null,
  market_data_available     boolean not null default false,
  basis                     text not null check (char_length(basis) > 0),
  notes                     jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  created_at                timestamptz not null default now(),
  check ((payback_status = 'calculable') = (payback_months is not null)),
  foreign key (analysis_id, store_id) references public.analyses (id, store_id) on delete cascade
);

create index premium_analyses_analysis_idx on public.premium_analyses (analysis_id);

-- -----------------------------------------------------------------------------
-- 12. risk_assessments : 규칙 기반 위험 탐지 결과 (근거 필수)
-- -----------------------------------------------------------------------------
create table public.risk_assessments (
  id                  uuid primary key default gen_random_uuid(),
  analysis_id         uuid not null,
  store_id            uuid not null,
  rule_id             text not null,  -- 탐지한 규칙 식별자
  category            public.risk_category not null,
  level               public.risk_level not null,
  title               text not null check (char_length(title) > 0),
  cause               text not null check (char_length(cause) > 0),
  evidence            jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  required_documents  text[] not null default '{}',
  recommended_action  text not null check (char_length(recommended_action) > 0),
  ai_explanation      text,
  created_at          timestamptz not null default now(),
  foreign key (analysis_id, store_id) references public.analyses (id, store_id) on delete cascade
);

create index risk_assessments_analysis_idx on public.risk_assessments (analysis_id);
create index risk_assessments_store_level_idx on public.risk_assessments (store_id, level);

-- -----------------------------------------------------------------------------
-- 13. reports : 종합 실사 보고서 (분석 1건당 1개)
-- -----------------------------------------------------------------------------
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  analysis_id   uuid not null unique,
  store_id      uuid not null,
  content       jsonb not null,
  generated_by  uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (analysis_id, store_id) references public.analyses (id, store_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- 14. chat_messages : AI 상담 대화
-- -----------------------------------------------------------------------------
create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  analysis_id  uuid not null,
  store_id     uuid not null,
  user_id      uuid not null references public.users (id) on delete cascade,
  role         public.chat_role not null,
  content      text not null check (char_length(content) between 1 and 10000),
  cited_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(cited_sources) = 'array'),  -- 답변 근거로 사용한 분석 결과 ID
  created_at   timestamptz not null default now(),
  foreign key (analysis_id, store_id) references public.analyses (id, store_id) on delete cascade
);

create index chat_messages_analysis_created_idx on public.chat_messages (analysis_id, user_id, created_at);

-- =============================================================================
-- 행 수준 보안 (RLS)
-- =============================================================================

-- 정책 안에서 stores를 다시 조회할 때 RLS가 재귀하지 않도록 security definer 함수로 감싼다.
create function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and owner_id = auth.uid()
  );
$$;

create function public.can_view_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and (owner_id = auth.uid() or is_published)
  );
$$;

alter table public.users                 enable row level security;
alter table public.stores                enable row level security;
alter table public.documents             enable row level security;
alter table public.extracted_data        enable row level security;
alter table public.normalized_data       enable row level security;
alter table public.monthly_revenues      enable row level security;
alter table public.monthly_expenses      enable row level security;
alter table public.analyses              enable row level security;
alter table public.revenue_verifications enable row level security;
alter table public.profit_analyses       enable row level security;
alter table public.premium_analyses      enable row level security;
alter table public.risk_assessments      enable row level security;
alter table public.reports               enable row level security;
alter table public.chat_messages         enable row level security;

-- users: 본인 프로필만 조회·수정. role 컬럼은 직접 수정할 수 없다.
create policy users_select_own on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy users_update_own on public.users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.users from authenticated;
grant update (display_name) on public.users to authenticated;

-- stores: 양도인은 자기 매물 전체 권한, 양수인은 공개된 매물 조회
create policy stores_select on public.stores
  for select to authenticated using (owner_id = (select auth.uid()) or is_published);
create policy stores_insert on public.stores
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy stores_update on public.stores
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy stores_delete on public.stores
  for delete to authenticated using (owner_id = (select auth.uid()));

-- 원본 자료(문서·추출·정규화)는 매물 소유자만 접근
create policy documents_owner_all on public.documents
  for all to authenticated using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy extracted_data_owner_select on public.extracted_data
  for select to authenticated using (public.is_store_owner(store_id));
create policy extracted_data_owner_insert on public.extracted_data
  for insert to authenticated with check (public.is_store_owner(store_id));
create policy normalized_data_owner_all on public.normalized_data
  for all to authenticated using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

-- 월별 수치와 분석 결과: 공개 매물이면 양수인도 조회, 쓰기는 소유자만
create policy monthly_revenues_select on public.monthly_revenues
  for select to authenticated using (public.can_view_store(store_id));
create policy monthly_revenues_owner_write on public.monthly_revenues
  for all to authenticated using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

create policy monthly_expenses_select on public.monthly_expenses
  for select to authenticated using (public.can_view_store(store_id));
create policy monthly_expenses_owner_write on public.monthly_expenses
  for all to authenticated using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

create policy analyses_select on public.analyses
  for select to authenticated using (public.can_view_store(store_id));
create policy analyses_owner_write on public.analyses
  for all to authenticated using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

create policy revenue_verifications_select on public.revenue_verifications
  for select to authenticated using (public.can_view_store(store_id));
create policy profit_analyses_select on public.profit_analyses
  for select to authenticated using (public.can_view_store(store_id));
create policy premium_analyses_select on public.premium_analyses
  for select to authenticated using (public.can_view_store(store_id));
create policy risk_assessments_select on public.risk_assessments
  for select to authenticated using (public.can_view_store(store_id));
create policy reports_select on public.reports
  for select to authenticated using (public.can_view_store(store_id));
-- 위 5개 결과 테이블의 쓰기는 서버 분석 엔진(service_role)만 수행한다.

-- chat_messages: 본인 대화만, 볼 수 있는 매물에 대해서만
create policy chat_messages_select_own on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_store(store_id) and role = 'user');
