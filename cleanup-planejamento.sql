-- GastoCerto · remove o modulo de Planejamento e corrige o orcamento compartilhado
-- Seguro rodar mais de uma vez.
--
-- MANTEM: rollover (levar saldo pro mes seguinte), transferencia entre categorias,
--         cartoes, parcelas, recorrentes e comprovantes.
-- REMOVE: apenas o planejamento baseado na planilha.

-- ========== 1) orcamento do mes passa a viver na CATEGORIA ==========
-- Antes ficava em months.budgets, que e uma linha POR USUARIO: por isso o ajuste
-- ou a transferencia nao aparecia para quem recebeu a categoria compartilhada.
-- Na categoria, todo mundo que enxerga a categoria enxerga o valor.

alter table categories add column if not exists month_budgets jsonb default '{}'::jsonb;

-- migra o que ja existe em months.budgets para a categoria correspondente
do $$
declare r record;
begin
  for r in
    select m.user_id, m.key, kv.key as cat_id, kv.value as valor
      from months m, lateral jsonb_each(coalesce(m.budgets,'{}'::jsonb)) kv
     where m.budgets is not null and m.budgets <> '{}'::jsonb
  loop
    update categories
       set month_budgets = coalesce(month_budgets,'{}'::jsonb)
                           || jsonb_build_object(r.key, r.valor)
     where id = r.cat_id and user_id = r.user_id;
  end loop;
end $$;

-- ========== 2) rollover e transferencia visiveis para quem recebeu a categoria ==========
-- Sem isso, o saldo levado do mes anterior tambem so aparecia para o dono.

drop policy if exists br_all on budget_rollovers;
drop policy if exists br_own on budget_rollovers;
drop policy if exists br_shared_read on budget_rollovers;
create policy br_own on budget_rollovers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy br_shared_read on budget_rollovers for select
  using (cat_id in (
    select cs.category_id from category_shares cs
     where cs.shared_with_user_id = auth.uid() and cs.status = 'accepted'));

drop policy if exists bt_all on budget_transfers;
drop policy if exists bt_own on budget_transfers;
drop policy if exists bt_shared_read on budget_transfers;
create policy bt_own on budget_transfers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bt_shared_read on budget_transfers for select
  using (from_cat_id in (
           select cs.category_id from category_shares cs
            where cs.shared_with_user_id = auth.uid() and cs.status = 'accepted')
      or to_cat_id in (
           select cs.category_id from category_shares cs
            where cs.shared_with_user_id = auth.uid() and cs.status = 'accepted'));

-- ========== 3) remove o planejamento ==========
-- apaga as categorias que a importacao da planilha criou (se houver)
delete from categories where id like 'pl-%';

drop table if exists plan_entries cascade;
drop table if exists balance_anchors cascade;
drop table if exists planned_items cascade;
drop table if exists incomes cascade;
drop table if exists finance_settings cascade;

alter table categories drop column if exists plan_defer;
alter table categories drop column if exists show_home;
alter table categories drop column if exists show_plan;
alter table categories drop column if exists group_name;

alter table expenses drop column if exists plan_entry_id;
alter table expenses drop column if exists planned_item_id;
alter table expenses drop column if exists paid;
alter table expenses drop column if exists notes;

-- ========== 4) rollover passa a valer a partir do mes seguinte ==========
-- Guarda o mes em que o acumulo foi ligado. Sem isso, marcar a opcao hoje
-- levaria o saldo do mes passado para o mes atual, mexendo em algo ja fechado.
alter table categories add column if not exists rollover_from text;

-- quem ja tinha a opcao ligada continua valendo desde sempre (nao mexe no passado)
update categories set rollover_from = null
 where rollover_positive is not true and rollover_negative is not true;
