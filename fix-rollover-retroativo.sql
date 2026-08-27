-- GastoCerto · corrige o saldo levado retroativamente (todos os usuarios)
--
-- Contexto: antes da v5.2, marcar "levar a sobra/estouro" puxava na hora o saldo
-- do mes anterior para o mes CORRENTE. Agora o acumulo so vale a partir do mes
-- seguinte ao que a opcao foi ligada. Este script desfaz o que entrou retroativo.
--
-- Toca apenas em auto = true. Os saldos levados a mao (auto = false), pelo botao
-- "Levar saldos" num mes fechado, foram escolha do usuario e ficam intactos.
--
-- Rode PRIMEIRO o alter da v5.2, se ainda nao rodou:
alter table categories add column if not exists rollover_from text;

-- ---------------------------------------------------------------------------
-- 1) Confira antes de apagar: o que sera removido
-- ---------------------------------------------------------------------------
-- Descomente para inspecionar:
--
-- select c.name as categoria, u.email, r.from_month, r.to_month, r.amount, r.created_at
--   from budget_rollovers r
--   join categories c on c.id = r.cat_id
--   join auth.users u on u.id = r.user_id
--  where r.auto is true
--    and r.to_month = to_char(current_date, 'YYYY-MM')
--    and (select count(*) from budget_rollovers r2
--          where r2.cat_id = r.cat_id and r2.user_id = r.user_id and r2.auto is true) = 1
--  order by u.email, c.name;

-- ---------------------------------------------------------------------------
-- 2) Remove o saldo que entrou retroativo
-- ---------------------------------------------------------------------------
-- Criterio: e automatico, caiu no mes corrente, e e o UNICO automatico daquela
-- categoria. Ou seja, a opcao acabou de ser ligada e trouxe o mes passado junto.
-- Quem ja vinha acumulando ha varios meses tem mais de um registro e nao entra
-- aqui: esse fluxo e legitimo e continua.

delete from budget_rollovers r
 where r.auto is true
   and r.to_month = to_char(current_date, 'YYYY-MM')
   and (select count(*) from budget_rollovers r2
         where r2.cat_id = r.cat_id
           and r2.user_id = r.user_id
           and r2.auto is true) = 1;

-- ---------------------------------------------------------------------------
-- 3) Define a partir de quando cada categoria volta a acumular
-- ---------------------------------------------------------------------------
-- Categoria com a opcao ligada e que ficou SEM nenhum automatico: recomeca no
-- mes que vem, que e a regra nova.
update categories c
   set rollover_from = to_char(current_date + interval '1 month', 'YYYY-MM')
 where (c.rollover_positive is true or c.rollover_negative is true)
   and not exists (select 1 from budget_rollovers r
                    where r.cat_id = c.id and r.user_id = c.user_id and r.auto is true);

-- Categoria que ja vinha acumulando: mantem o fluxo, sem restricao de inicio.
update categories c
   set rollover_from = null
 where (c.rollover_positive is true or c.rollover_negative is true)
   and exists (select 1 from budget_rollovers r
                where r.cat_id = c.id and r.user_id = c.user_id and r.auto is true);

-- Categoria com a opcao desligada: campo limpo.
update categories
   set rollover_from = null
 where rollover_positive is not true and rollover_negative is not true;

-- ---------------------------------------------------------------------------
-- 4) Resultado
-- ---------------------------------------------------------------------------
select c.name as categoria, u.email,
       c.rollover_positive as leva_sobra,
       c.rollover_negative as leva_estouro,
       coalesce(c.rollover_from, 'sem restricao') as acumula_a_partir_de,
       (select count(*) from budget_rollovers r
         where r.cat_id = c.id and r.user_id = c.user_id) as saldos_levados
  from categories c
  join auth.users u on u.id = c.user_id
 where c.rollover_positive is true or c.rollover_negative is true
 order by u.email, c.name;
