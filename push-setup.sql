-- GastoCerto · notificacoes push (app fechado)
-- Rode este arquivo inteiro no SQL Editor do Supabase. E idempotente.
-- Depois dele faltam dois passos que NAO sao SQL: publicar a Edge Function
-- notify-expense e criar o Database Webhook. Ver PROJETO.md, secao 12.

-- 1. Onde ficam as inscricoes de push -----------------------------------------
-- Uma linha por aparelho. A mesma pessoa no iPhone e no desktop tem duas.
-- O endpoint e unico e e o que o navegador devolve ao se inscrever.

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- create policy nao aceita if not exists; sempre drop antes.
drop policy if exists ps_own on push_subscriptions;
create policy ps_own on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A Edge Function le esta tabela com a service_role, que passa por cima da RLS.
-- Ninguem mais precisa ler a inscricao de ninguem.


-- 2. Cartao de categoria compartilhada (v5.11) --------------------------------
-- Repetido aqui de proposito: se voce ainda nao rodou, roda junto.
-- Sem isso o cartao de quem compartilhou a categoria nao aparece no lancamento.

drop policy if exists cards_shared_read on cards;
create policy cards_shared_read on cards
  for select
  using (
    user_id = auth.uid()
    or user_id in (select shared_by_user_id from category_shares
                   where status = 'accepted'
                     and (shared_with_user_id = auth.uid()
                          or shared_with_email = auth.jwt()->>'email'))
    or user_id in (select shared_with_user_id from category_shares
                   where status = 'accepted' and shared_by_user_id = auth.uid())
  );


-- 3. Conferencia --------------------------------------------------------------
-- Depois de ativar as notificacoes no app, esta query tem que devolver 1 linha
-- por aparelho seu:
--
--   select user_id, left(endpoint, 60) as endpoint, user_agent, created_at
--     from push_subscriptions order by created_at desc;
--
-- Para achar quem seria avisado por um lancamento numa categoria:
--
--   select c.user_id as dono, s.shared_with_user_id as convidado
--     from categories c
--     left join category_shares s
--       on s.category_id = c.id and s.status = 'accepted'
--    where c.id = 'ID_DA_CATEGORIA';
