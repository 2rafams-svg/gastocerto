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


-- 3. O webhook, em SQL --------------------------------------------------------
-- Substitui o "Database Webhook" do painel. Faz a mesma coisa e manda menos:
-- o webhook da UI envia a linha inteira de expenses, INCLUSIVE image_url, que e
-- o comprovante em base64. Aqui vao so os campos que a funcao usa.
--
-- Rode o passo 3.1 UMA VEZ, trocando a chave. Depois rode 3.2 e 3.3.

create extension if not exists pg_net;

-- 3.1 Guarde a service_role key no Vault (Settings > API > service_role).
--     Descomente, troque o valor, rode, e comente de novo.
--     Para trocar depois:
--       select vault.update_secret(id, 'NOVA_CHAVE') from vault.secrets
--        where name = 'notify_expense_key';
--
-- select vault.create_secret('COLE_AQUI_A_SERVICE_ROLE_KEY',
--                            'notify_expense_key',
--                            'chave usada pelo trigger de push');


-- 3.2 A funcao que chama a Edge Function.
-- security definer porque so o dono do banco le o Vault; o insert vem do
-- usuario autenticado. Falha de rede nao pode derrubar o lancamento, por isso
-- o exception no fim: se o push nao sair, o gasto e salvo do mesmo jeito.

create or replace function public.notify_expense_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'notify_expense_key'
   limit 1;

  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://asnuusgwtsjpwuaakfuc.supabase.co/functions/v1/notify-expense',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type',   'INSERT',
      'table',  'expenses',
      'schema', tg_table_schema,
      'record', jsonb_build_object(
        'id',                new.id,
        'user_id',           new.user_id,
        'cat_id',            new.cat_id,
        'month_key',         new.month_key,
        'name',              new.name,
        'value',             new.value,
        'installment_no',    new.installment_no,
        'installment_total', new.installment_total
      )
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  return new;
end;
$$;


-- 3.3 O gatilho.
-- O when() evita 9 chamadas inuteis numa compra em 10x: as parcelas seguintes
-- entram no mesmo insert e a funcao ja as descartaria do outro lado.

drop trigger if exists trg_notify_expense_push on expenses;
create trigger trg_notify_expense_push
  after insert on expenses
  for each row
  when (new.installment_no is null or new.installment_no <= 1)
  execute function public.notify_expense_push();


-- 4. Conferencia --------------------------------------------------------------
-- O gatilho existe?
--
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'expenses'::regclass and not tgisinternal;
--
-- A chave esta no Vault?
--
--   select name, created_at from vault.secrets where name = 'notify_expense_key';
--
-- Lance um gasto no app e veja o que o Postgres recebeu de volta. status_code
-- 200 e a funcao respondendo; 401 e chave errada; vazio e o gatilho nao disparou:
--
--   select id, status_code, left(content, 200) as resposta, created
--     from net._http_response order by created desc limit 5;
--
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
