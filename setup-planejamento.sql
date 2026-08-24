-- GastoCerto · setup do modulo de Planejamento (v3.14 -> v4.3)
-- Seguro rodar quantas vezes quiser: tudo e "if not exists" ou recriado.
-- Rode ESTE arquivo primeiro, depois o import-planilha.sql.

-- ---------------------------------------------------------------- cartoes
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  closing_day int not null,
  due_day int,
  created_at timestamptz default now()
);
alter table cards enable row level security;
drop policy if exists cards_all on cards;
create policy cards_all on cards for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------- rollover de saldo
create table if not exists budget_rollovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cat_id text references categories(id) on delete cascade,
  from_month text not null,
  to_month text not null,
  amount numeric not null,
  auto boolean default false,
  created_at timestamptz default now(),
  unique (user_id, cat_id, from_month, to_month)
);
alter table budget_rollovers enable row level security;
drop policy if exists br_all on budget_rollovers;
create policy br_all on budget_rollovers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------- transferencia entre categorias
create table if not exists budget_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  from_cat_id text,
  to_cat_id text,
  amount numeric not null,
  created_at timestamptz default now()
);
alter table budget_transfers enable row level security;
drop policy if exists bt_all on budget_transfers;
create policy bt_all on budget_transfers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------- ancoras de saldo
create table if not exists balance_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  balance numeric not null,
  note text,
  created_at timestamptz default now(),
  unique (user_id, month_key)
);
alter table balance_anchors enable row level security;
drop policy if exists ba_all on balance_anchors;
create policy ba_all on balance_anchors for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------- compromissos
create table if not exists plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  name text not null,
  cat_id text references categories(id) on delete set null,
  value numeric not null,
  schedule text not null,
  start_month text not null,
  end_month text,
  count int,
  month_values jsonb default '{}'::jsonb,
  barcode text,
  due_day int,
  position int default 0,
  created_at timestamptz default now()
);
alter table plan_entries enable row level security;
drop policy if exists pe_all on plan_entries;
create policy pe_all on plan_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------- colunas novas
alter table categories add column if not exists group_name text;
alter table categories add column if not exists plan_defer boolean default false;
alter table categories add column if not exists show_home boolean default true;
alter table categories add column if not exists show_plan boolean default true;
alter table categories add column if not exists rollover_positive boolean default false;
alter table categories add column if not exists rollover_negative boolean default false;

alter table months add column if not exists budgets jsonb default '{}'::jsonb;

alter table expenses add column if not exists notes text;
alter table expenses add column if not exists paid boolean;
alter table expenses add column if not exists card_id uuid references cards(id) on delete set null;
alter table expenses add column if not exists plan_entry_id uuid references plan_entries(id) on delete set null;
alter table expenses add column if not exists installment_no integer;
alter table expenses add column if not exists installment_total integer;
alter table expenses add column if not exists installment_group text;
alter table expenses add column if not exists recurring boolean default false;
alter table expenses add column if not exists image_url text;
