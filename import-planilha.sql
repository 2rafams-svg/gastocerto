-- GastoCerto · importacao da planilha de planejamento (Ago–Dez 2026)
-- Rode no SQL Editor do Supabase. Pode rodar de novo: ele limpa a importacao anterior antes.
-- Requer o SQL da v4.0 ja aplicado (tabelas plan_entries e balance_anchors).

do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = '2rafab@gmail.com';
  if v_uid is null then
    raise exception 'Usuario nao encontrado. Ajuste o e-mail na linha acima.';
  end if;

  -- limpeza da importacao anterior (nao toca em nada que voce criou pelo app)
  delete from plan_entries where user_id = v_uid and cat_id like 'pl-%';
  delete from plan_entries where user_id = v_uid and kind = 'in' and name = 'Salario';
  delete from categories   where user_id = v_uid and id like 'pl-%';
  delete from balance_anchors where user_id = v_uid and month_key = '2026-08';

  -- 1) categorias (o budget e o valor tipico de dezembro, usado so onde nao houver compromisso)
  insert into categories (id, user_id, name, budget, position, group_name) values
    ('pl-contabeis',   v_uid, 'Contabeis',   4150, 0, 'Contabeis'),
    ('pl-cartoes',     v_uid, 'Cartoes',     8553, 1, 'Cartoes'),
    ('pl-negociacoes', v_uid, 'Negociacoes', 4969, 2, 'Negociacoes'),
    ('pl-gerais',      v_uid, 'Gerais',      6923, 3, 'Gerais'),
    ('pl-role',        v_uid, 'Role',        1800, 4, 'Role'),
    ('pl-animais',     v_uid, 'Animais',     1400, 5, 'Animais'),
    ('pl-combustivel', v_uid, 'Combustivel',  350, 6, 'Combustivel');

  -- 2) saldo inicial de agosto
  insert into balance_anchors (user_id, month_key, balance, note)
    values (v_uid, '2026-08', 5123, 'Saldo inicial da planilha');

  -- 3) agosto: as 4 categorias sem compromisso precisam ficar zeradas no mes
  insert into months (user_id, key, closed, budgets)
    select v_uid, '2026-08', false, '{}'::jsonb
    where not exists (select 1 from months m where m.user_id = v_uid and m.key = '2026-08');

  update months
     set budgets = coalesce(budgets, '{}'::jsonb) || jsonb_build_object(
           'pl-contabeis', 0, 'pl-role', 0, 'pl-animais', 0, 'pl-combustivel', 0)
   where user_id = v_uid and key = '2026-08';

  -- 4) receita
  insert into plan_entries (user_id, kind, name, cat_id, value, schedule, start_month, end_month, count, month_values, position) values
    (v_uid, 'in', 'Salario', null, 32801, 'monthly', '2026-09', null, null, '{}'::jsonb, 0);

  -- 5) compromissos (saidas)
  insert into plan_entries (user_id, kind, name, cat_id, value, schedule, start_month, end_month, count, month_values, position) values

    -- Contabeis
    (v_uid,'out','Contabilidade',      'pl-contabeis',  430,'monthly','2026-09',null,null,'{}'::jsonb,0),
    (v_uid,'out','Transferir CNPJ',    'pl-contabeis', 1200,'once',   '2026-09',null,null,'{}'::jsonb,1),
    (v_uid,'out','Imposto',            'pl-contabeis', 3280,'monthly','2026-09',null,null,'{}'::jsonb,2),
    (v_uid,'out','Imposto parcelado',  'pl-contabeis',  440,'monthly','2026-09',null,null,'{}'::jsonb,3),

    -- Cartoes
    (v_uid,'out','Nubank',             'pl-cartoes',    889,'monthly','2026-09',null,null,'{"2026-09":4700,"2026-10":1043}'::jsonb,0),
    (v_uid,'out','Smiles',             'pl-cartoes',   1380,'monthly','2026-09',null,null,'{"2026-09":1733,"2026-10":1733,"2026-11":1733}'::jsonb,1),
    (v_uid,'out','Infinite Carol',     'pl-cartoes',   1166,'monthly','2026-09',null,null,'{}'::jsonb,2),
    (v_uid,'out','Itau',               'pl-cartoes',   1500,'monthly','2026-09',null,null,'{}'::jsonb,3),
    (v_uid,'out','C6',                 'pl-cartoes',   3118,'monthly','2026-09',null,null,'{}'::jsonb,4),
    (v_uid,'out','Rosely',             'pl-cartoes',    500,'monthly','2026-08',null,null,'{"2026-08":833,"2026-09":833,"2026-10":833}'::jsonb,5),
    (v_uid,'out','Nubank Carol',       'pl-cartoes',    250,'monthly','2026-09','2026-10',null,'{}'::jsonb,6),
    (v_uid,'out','Nubank 2',           'pl-cartoes',    367,'once',   '2026-09',null,null,'{}'::jsonb,7),

    -- Negociacoes
    (v_uid,'out','Consignado',         'pl-negociacoes', 938,'monthly','2026-09',null,null,'{}'::jsonb,0),
    (v_uid,'out','Atacado',            'pl-negociacoes', 240,'monthly','2026-09',null,null,'{}'::jsonb,1),
    (v_uid,'out','Nu',                 'pl-negociacoes',3548,'monthly','2026-08',null,null,'{}'::jsonb,2),
    (v_uid,'out','Carrefour',          'pl-negociacoes', 243,'monthly','2026-08',null,null,'{}'::jsonb,3),

    -- Gerais
    (v_uid,'out','Limpeza',            'pl-gerais',     800,'monthly','2026-09',null,null,'{}'::jsonb,0),
    (v_uid,'out','Mercado',            'pl-gerais',    3000,'monthly','2026-09',null,null,'{"2026-09":104}'::jsonb,1),
    (v_uid,'out','AP',                 'pl-gerais',    1300,'monthly','2026-09',null,null,'{}'::jsonb,2),
    (v_uid,'out','Academia',           'pl-gerais',     183,'monthly','2026-09',null,null,'{}'::jsonb,3),
    (v_uid,'out','Saude',              'pl-gerais',     600,'monthly','2026-09',null,null,'{}'::jsonb,4),
    (v_uid,'out','Saude parcela atrasada','pl-gerais',  600,'once',   '2026-09',null,null,'{}'::jsonb,5),
    (v_uid,'out','Psicologa',          'pl-gerais',     600,'monthly','2026-08',null,null,'{"2026-08":300}'::jsonb,6),
    (v_uid,'out','Psiquiatra',         'pl-gerais',     270,'monthly','2026-08',null,null,'{"2026-08":-180,"2026-09":0,"2026-11":0}'::jsonb,7),
    (v_uid,'out','Claude',             'pl-gerais',     120,'monthly','2026-09',null,null,'{}'::jsonb,8),
    (v_uid,'out','Internet',           'pl-gerais',      50,'monthly','2026-09',null,null,'{}'::jsonb,9),
    (v_uid,'out','Nubank emprestimo',  'pl-gerais',    2680,'once',   '2026-09',null,null,'{}'::jsonb,10),

    -- Role / Animais / Combustivel
    (v_uid,'out','Role',               'pl-role',      1800,'monthly','2026-09',null,null,'{"2026-09":60}'::jsonb,0),
    (v_uid,'out','Animais',            'pl-animais',   1400,'monthly','2026-09',null,null,'{"2026-09":355}'::jsonb,0),
    (v_uid,'out','Combustivel',        'pl-combustivel',350,'monthly','2026-09',null,null,'{"2026-09":250}'::jsonb,0);

  raise notice 'Importacao concluida.';
end $$;
