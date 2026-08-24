-- GastoCerto - importacao da planilha (2026-08 a 2029-12, 41 meses)
-- Reutiliza as categorias que voce JA tem: casa por nome (sem acento, sem maiuscula).
-- So cria categoria nova se nao encontrar nenhuma equivalente.
-- Rode setup-planejamento.sql antes. Pode rodar este quantas vezes quiser.

do $$
declare
  v_uid uuid;
  v_contabeis text;
  v_cartoes text;
  v_negociacoes text;
  v_gerais text;
  v_role text;
  v_pet text;
  v_comb text;
  v_reserva text;
  v_outras int;
begin
  select id into v_uid from auth.users where email = '2rafab@gmail.com';
  if v_uid is null then raise exception 'Usuario nao encontrado - ajuste o e-mail acima.'; end if;

  -- limpa a importacao anterior
  delete from plan_entries   where user_id = v_uid;
  delete from balance_anchors where user_id = v_uid and month_key = '2026-08';

  -- resolve cada categoria do plano: usa a sua, ou cria se nao existir
  select id into v_contabeis from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Contabeis'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Contábeis'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_contabeis is null then
    v_contabeis := 'pl-contabeis';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_contabeis, v_uid, 'Contabeis', 0, 900, 'Contabeis', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Contabeis')
     where id = v_contabeis;
  end if;

  select id into v_cartoes from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Cartoes'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Cartões'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Cartao'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Cartão'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_cartoes is null then
    v_cartoes := 'pl-cartoes';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_cartoes, v_uid, 'Cartoes', 0, 900, 'Cartoes', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Cartoes')
     where id = v_cartoes;
  end if;

  select id into v_negociacoes from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Negociacoes'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Negociações'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_negociacoes is null then
    v_negociacoes := 'pl-negociacoes';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_negociacoes, v_uid, 'Negociacoes', 0, 900, 'Negociacoes', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Negociacoes')
     where id = v_negociacoes;
  end if;

  select id into v_gerais from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Gerais'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Geral'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Gastos gerais'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_gerais is null then
    v_gerais := 'pl-gerais';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_gerais, v_uid, 'Gerais', 0, 900, 'Gerais', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Gerais')
     where id = v_gerais;
  end if;

  select id into v_role from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Role'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Rolê'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Role '), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_role is null then
    v_role := 'pl-role';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_role, v_uid, 'Role', 0, 900, 'Role', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Role')
     where id = v_role;
  end if;

  select id into v_pet from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Pet'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Animais'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Animal'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_pet is null then
    v_pet := 'pl-pet';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_pet, v_uid, 'Pet', 0, 900, 'Pet', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Pet')
     where id = v_pet;
  end if;

  select id into v_comb from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Combustivel'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), translate(lower('Combustível'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_comb is null then
    v_comb := 'pl-comb';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_comb, v_uid, 'Combustivel', 0, 900, 'Combustivel', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Combustivel')
     where id = v_comb;
  end if;

  select id into v_reserva from categories
   where user_id = v_uid and translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') in (translate(lower('Reserva'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
   order by position limit 1;
  if v_reserva is null then
    v_reserva := 'pl-reserva';
    insert into categories (id, user_id, name, budget, position, group_name, show_home, show_plan)
      values (v_reserva, v_uid, 'Reserva', 0, 900, 'Reserva', false, true);
  else
    update categories set show_plan = true, group_name = coalesce(group_name, 'Reserva')
     where id = v_reserva;
  end if;

  -- categorias que sobraram ficam fora da projecao (evita somar por cima dos compromissos).
  -- se alguma delas tambem deve entrar no plano, remarque "No Planejamento" no app.
  update categories set show_plan = false
   where user_id = v_uid
     and id not in (v_contabeis, v_cartoes, v_negociacoes, v_gerais, v_role, v_pet, v_comb, v_reserva);
  get diagnostics v_outras = row_count;

  -- remove categorias 'pl-' orfas de importacoes anteriores
  delete from categories
   where user_id = v_uid and id like 'pl-%'
     and id not in (v_contabeis, v_cartoes, v_negociacoes, v_gerais, v_role, v_pet, v_comb, v_reserva);

  insert into balance_anchors (user_id, month_key, balance, note)
    values (v_uid, '2026-08', 5123, 'Saldo inicial da planilha');

  insert into plan_entries
    (user_id, kind, name, cat_id, value, schedule, start_month, end_month, count, month_values, position) values
    (v_uid, 'in', 'PLR', null, 51000, 'once', '2027-04', null, null, '{}'::jsonb, 0),
    (v_uid, 'in', 'PLR', null, 51000, 'once', '2028-04', null, null, '{}'::jsonb, 0),
    (v_uid, 'in', 'Pisquiatra', null, 180, 'once', '2026-08', null, null, '{}'::jsonb, 0),
    (v_uid, 'in', 'Reserva', null, 6625, 'once', '2027-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'in', 'Salário', null, 34441.05, 'monthly', '2026-09', null, null, '{"2026-09": 32801.0, "2026-10": 32801.0, "2026-11": 32801.0, "2026-12": 32801.0, "2027-01": 32801.0, "2027-02": 32801.0, "2028-03": 36163.0, "2028-04": 36163.0, "2028-05": 36163.0, "2028-06": 36163.0, "2028-07": 36163.0, "2028-08": 36163.0, "2028-09": 36163.0, "2028-10": 36163.0, "2028-11": 36163.0, "2028-12": 36163.0, "2029-01": 36163.0, "2029-02": 36163.0, "2029-03": 37971.0, "2029-04": 37971.0, "2029-05": 37971.0, "2029-06": 37971.0, "2029-07": 37971.0, "2029-08": 37971.0, "2029-09": 37971.0, "2029-10": 37971.0, "2029-11": 37971.0, "2029-12": 37971.0}'::jsonb, 0),
    (v_uid, 'out', 'C6', v_cartoes, 3118, 'monthly', '2026-09', '2028-04', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Infinite Carol', v_cartoes, 1166, 'monthly', '2026-09', '2026-12', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Itau', v_cartoes, 1500, 'monthly', '2026-09', '2029-03', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Nubank', v_cartoes, 889, 'monthly', '2026-09', '2027-08', null, '{"2026-09": 4700.0, "2026-10": 1043.0, "2027-04": 39.0, "2027-05": 39.0, "2027-06": 39.0, "2027-07": 39.0, "2027-08": 39.0}'::jsonb, 0),
    (v_uid, 'out', 'Nubank 2', v_cartoes, 367, 'monthly', '2026-09', '2026-09', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Nubank Carol', v_cartoes, 250, 'monthly', '2026-09', '2026-10', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Rosely', v_cartoes, 833, 'monthly', '2026-08', '2027-01', null, '{"2026-11": 500.0, "2026-12": 500.0, "2027-01": 500.0}'::jsonb, 0),
    (v_uid, 'out', 'Smiles', v_cartoes, 1733, 'monthly', '2026-09', '2027-03', null, '{"2026-12": 1380.0, "2027-01": 1160.0, "2027-02": 464.0, "2027-03": 464.0}'::jsonb, 0),
    (v_uid, 'out', 'Combustível', v_comb, 350, 'monthly', '2026-09', null, null, '{"2026-09": 250.0}'::jsonb, 0),
    (v_uid, 'out', 'Contabiidade', v_contabeis, 430, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Imposto', v_contabeis, 3444, 'monthly', '2026-09', null, null, '{"2026-09": 3280.0, "2026-10": 3280.0, "2026-11": 3280.0, "2026-12": 3280.0, "2027-01": 3280.0, "2027-02": 3280.0, "2027-04": 8544.0, "2028-03": 3616.0, "2028-04": 8716.0, "2028-05": 3616.0, "2028-06": 3616.0, "2028-07": 3616.0, "2028-08": 3616.0, "2028-09": 3616.0, "2028-10": 3616.0, "2028-11": 3616.0, "2028-12": 3616.0, "2029-01": 3616.0, "2029-02": 3616.0, "2029-03": 3797.0, "2029-04": 3797.0, "2029-05": 3797.0, "2029-06": 3797.0, "2029-07": 3797.0, "2029-08": 3797.0, "2029-09": 3797.0, "2029-10": 3797.0, "2029-11": 3797.0, "2029-12": 3797.0}'::jsonb, 0),
    (v_uid, 'out', 'Imposto 2', v_contabeis, 440, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Transferir CNPJ', v_contabeis, 1200, 'monthly', '2026-09', '2026-09', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'AP', v_gerais, 1300, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Academia', v_gerais, 183, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Amb', v_gerais, 5000, 'monthly', '2028-01', null, null, '{"2028-12": 60000.0, "2029-12": 60000.0}'::jsonb, 0),
    (v_uid, 'out', 'Caixa', v_gerais, 25000, 'monthly', '2027-12', '2027-12', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Casamento', v_gerais, 90000, 'monthly', '2027-10', '2027-10', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Claude', v_gerais, 120, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Internet', v_gerais, 50, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Limpeza', v_gerais, 800, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Mercado', v_gerais, 3000, 'monthly', '2026-09', null, null, '{"2026-09": 104.0}'::jsonb, 0),
    (v_uid, 'out', 'Nubank', v_gerais, 2680, 'monthly', '2026-09', '2026-09', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Pisquiatra', v_gerais, 0, 'monthly', '2026-10', null, null, '{"2026-10": 270.0, "2026-12": 270.0, "2027-02": 270.0, "2027-04": 270.0, "2027-06": 270.0, "2027-08": 270.0, "2027-10": 270.0, "2028-02": 270.0, "2028-04": 270.0, "2028-06": 270.0, "2028-08": 270.0, "2028-10": 270.0, "2028-12": 270.0, "2029-02": 270.0, "2029-04": 270.0, "2029-06": 270.0, "2029-08": 270.0, "2029-10": 270.0, "2029-12": 270.0}'::jsonb, 0),
    (v_uid, 'out', 'Psicologa', v_gerais, 600, 'monthly', '2026-08', null, null, '{"2026-08": 300.0}'::jsonb, 0),
    (v_uid, 'out', 'Saúde', v_gerais, 600, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Saúde 2', v_gerais, 600, 'monthly', '2026-09', '2026-09', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'SouSmiles', v_gerais, 12000, 'monthly', '2027-12', '2027-12', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Atacado', v_negociacoes, 240, 'monthly', '2026-09', '2027-01', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Carrefour', v_negociacoes, 243, 'monthly', '2026-08', '2028-09', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Consignado', v_negociacoes, 938, 'monthly', '2026-09', null, null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Nu', v_negociacoes, 3548, 'monthly', '2026-08', '2028-01', null, '{}'::jsonb, 0),
    (v_uid, 'out', 'Animais', v_pet, 1400, 'monthly', '2026-09', null, null, '{"2026-09": 355.0}'::jsonb, 0),
    (v_uid, 'out', 'Reserva', v_reserva, 3000, 'monthly', '2027-01', null, null, '{"2027-01": 500.0, "2027-02": 500.0, "2027-03": 500.0, "2027-04": 500.0, "2027-05": 500.0, "2027-06": 500.0, "2027-07": 500.0, "2027-08": 500.0, "2027-09": 500.0, "2027-10": 500.0, "2027-11": 500.0, "2027-12": 1500.0, "2029-01": 5000.0, "2029-02": 5000.0, "2029-03": 5000.0, "2029-04": 5000.0, "2029-05": 5000.0, "2029-06": 5000.0, "2029-07": 5000.0, "2029-08": 5000.0, "2029-09": 5000.0, "2029-10": 5000.0, "2029-11": 5000.0, "2029-12": 5000.0}'::jsonb, 0),
    (v_uid, 'out', 'Role', v_role, 1800, 'monthly', '2026-09', null, null, '{"2026-09": 60.0}'::jsonb, 0);

  raise notice 'Import OK: % compromissos. % categoria(s) ficaram fora do plano.', 40, v_outras;
end $$;
