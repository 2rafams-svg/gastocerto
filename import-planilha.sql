-- GastoCerto - importacao da planilha de planejamento
-- Cobre 2026-08 a 2029-12 (41 meses), gerado a partir das abas 2026/2027/2028/2029.
-- Rode no SQL Editor do Supabase. Pode rodar de novo: limpa a importacao anterior antes.

alter table categories add column if not exists plan_defer boolean default false;

do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where email = '2rafab@gmail.com';
  if v_uid is null then raise exception 'Usuario nao encontrado - ajuste o e-mail acima.'; end if;

  delete from plan_entries where user_id = v_uid and (cat_id like 'pl-%' or cat_id is null);
  delete from categories   where user_id = v_uid and id like 'pl-%';
  delete from balance_anchors where user_id = v_uid and month_key = '2026-08';

  insert into categories (id, user_id, name, budget, position, group_name) values
    ('pl-contabeis', v_uid, 'Contabeis', 0, 0, 'Contabeis'),
    ('pl-cartoes', v_uid, 'Cartoes', 0, 1, 'Cartoes'),
    ('pl-negociacoes', v_uid, 'Negociacoes', 0, 2, 'Negociacoes'),
    ('pl-gerais', v_uid, 'Gerais', 0, 3, 'Gerais'),
    ('pl-role', v_uid, 'Role', 0, 4, 'Role'),
    ('pl-pet', v_uid, 'Pet', 0, 5, 'Pet'),
    ('pl-comb', v_uid, 'Combustivel', 0, 6, 'Combustivel'),
    ('pl-reserva', v_uid, 'Reserva', 0, 7, 'Reserva');

  insert into balance_anchors (user_id, month_key, balance, note)
    values (v_uid, '2026-08', 5123, 'Saldo inicial da planilha');

  insert into plan_entries (user_id,kind,name,cat_id,value,schedule,start_month,end_month,count,month_values,position) values
    (v_uid,'in','PLR',null,51000,'once','2027-04',null,null,'{}'::jsonb,0),
    (v_uid,'in','PLR',null,51000,'once','2028-04',null,null,'{}'::jsonb,0),
    (v_uid,'in','Pisquiatra',null,180,'once','2026-08',null,null,'{}'::jsonb,0),
    (v_uid,'in','Reserva',null,6625,'once','2027-09',null,null,'{}'::jsonb,0),
    (v_uid,'in','Salário',null,34441.05,'monthly','2026-09',null,null,'{"2026-09":32801,"2026-10":32801,"2026-11":32801,"2026-12":32801,"2027-01":32801,"2027-02":32801,"2028-03":36163,"2028-04":36163,"2028-05":36163,"2028-06":36163,"2028-07":36163,"2028-08":36163,"2028-09":36163,"2028-10":36163,"2028-11":36163,"2028-12":36163,"2029-01":36163,"2029-02":36163,"2029-03":37971,"2029-04":37971,"2029-05":37971,"2029-06":37971,"2029-07":37971,"2029-08":37971,"2029-09":37971,"2029-10":37971,"2029-11":37971,"2029-12":37971}'::jsonb,0);

  insert into plan_entries (user_id,kind,name,cat_id,value,schedule,start_month,end_month,count,month_values,position) values
    (v_uid,'out','C6','pl-cartoes',3118,'monthly','2026-09','2028-04',null,'{}'::jsonb,0),
    (v_uid,'out','Infinite Carol','pl-cartoes',1166,'monthly','2026-09','2026-12',null,'{}'::jsonb,1),
    (v_uid,'out','Itau','pl-cartoes',1500,'monthly','2026-09','2029-03',null,'{}'::jsonb,2),
    (v_uid,'out','Nubank','pl-cartoes',889,'monthly','2026-09','2027-08',null,'{"2026-09":4700,"2026-10":1043,"2027-04":39,"2027-05":39,"2027-06":39,"2027-07":39,"2027-08":39}'::jsonb,3),
    (v_uid,'out','Nubank 2','pl-cartoes',367,'monthly','2026-09','2026-09',null,'{}'::jsonb,4),
    (v_uid,'out','Nubank Carol','pl-cartoes',250,'monthly','2026-09','2026-10',null,'{}'::jsonb,5),
    (v_uid,'out','Rosely','pl-cartoes',833,'monthly','2026-08','2027-01',null,'{"2026-11":500,"2026-12":500,"2027-01":500}'::jsonb,6),
    (v_uid,'out','Smiles','pl-cartoes',1733,'monthly','2026-09','2027-03',null,'{"2026-12":1380,"2027-01":1160,"2027-02":464,"2027-03":464}'::jsonb,7),
    (v_uid,'out','Combustível','pl-comb',350,'monthly','2026-09',null,null,'{"2026-09":250}'::jsonb,0),
    (v_uid,'out','Contabiidade','pl-contabeis',430,'monthly','2026-09',null,null,'{}'::jsonb,0),
    (v_uid,'out','Imposto','pl-contabeis',3444,'monthly','2026-09',null,null,'{"2026-09":3280,"2026-10":3280,"2026-11":3280,"2026-12":3280,"2027-01":3280,"2027-02":3280,"2027-04":8544,"2028-03":3616,"2028-04":8716,"2028-05":3616,"2028-06":3616,"2028-07":3616,"2028-08":3616,"2028-09":3616,"2028-10":3616,"2028-11":3616,"2028-12":3616,"2029-01":3616,"2029-02":3616,"2029-03":3797,"2029-04":3797,"2029-05":3797,"2029-06":3797,"2029-07":3797,"2029-08":3797,"2029-09":3797,"2029-10":3797,"2029-11":3797,"2029-12":3797}'::jsonb,1),
    (v_uid,'out','Imposto 2','pl-contabeis',440,'monthly','2026-09',null,null,'{}'::jsonb,2),
    (v_uid,'out','Transferir CNPJ','pl-contabeis',1200,'monthly','2026-09','2026-09',null,'{}'::jsonb,3),
    (v_uid,'out','AP','pl-gerais',1300,'monthly','2026-09',null,null,'{}'::jsonb,0),
    (v_uid,'out','Academia','pl-gerais',183,'monthly','2026-09',null,null,'{}'::jsonb,1),
    (v_uid,'out','Amb','pl-gerais',5000,'monthly','2028-01',null,null,'{"2028-12":60000,"2029-12":60000}'::jsonb,2),
    (v_uid,'out','Caixa','pl-gerais',25000,'monthly','2027-12','2027-12',null,'{}'::jsonb,3),
    (v_uid,'out','Casamento','pl-gerais',90000,'monthly','2027-10','2027-10',null,'{}'::jsonb,4),
    (v_uid,'out','Claude','pl-gerais',120,'monthly','2026-09',null,null,'{}'::jsonb,5),
    (v_uid,'out','Internet','pl-gerais',50,'monthly','2026-09',null,null,'{}'::jsonb,6),
    (v_uid,'out','Limpeza','pl-gerais',800,'monthly','2026-09',null,null,'{}'::jsonb,7),
    (v_uid,'out','Mercado','pl-gerais',3000,'monthly','2026-09',null,null,'{"2026-09":104}'::jsonb,8),
    (v_uid,'out','Nubank','pl-gerais',2680,'monthly','2026-09','2026-09',null,'{}'::jsonb,9),
    (v_uid,'out','Pisquiatra','pl-gerais',0,'monthly','2026-10',null,null,'{"2026-10":270,"2026-12":270,"2027-02":270,"2027-04":270,"2027-06":270,"2027-08":270,"2027-10":270,"2028-02":270,"2028-04":270,"2028-06":270,"2028-08":270,"2028-10":270,"2028-12":270,"2029-02":270,"2029-04":270,"2029-06":270,"2029-08":270,"2029-10":270,"2029-12":270}'::jsonb,10),
    (v_uid,'out','Psicologa','pl-gerais',600,'monthly','2026-08',null,null,'{"2026-08":300}'::jsonb,11),
    (v_uid,'out','Saúde','pl-gerais',600,'monthly','2026-09',null,null,'{}'::jsonb,12),
    (v_uid,'out','Saúde 2','pl-gerais',600,'monthly','2026-09','2026-09',null,'{}'::jsonb,13),
    (v_uid,'out','SouSmiles','pl-gerais',12000,'monthly','2027-12','2027-12',null,'{}'::jsonb,14),
    (v_uid,'out','Atacado','pl-negociacoes',240,'monthly','2026-09','2027-01',null,'{}'::jsonb,0),
    (v_uid,'out','Carrefour','pl-negociacoes',243,'monthly','2026-08','2028-09',null,'{}'::jsonb,1),
    (v_uid,'out','Consignado','pl-negociacoes',938,'monthly','2026-09',null,null,'{}'::jsonb,2),
    (v_uid,'out','Nu','pl-negociacoes',3548,'monthly','2026-08','2028-01',null,'{}'::jsonb,3),
    (v_uid,'out','Animais','pl-pet',1400,'monthly','2026-09',null,null,'{"2026-09":355}'::jsonb,0),
    (v_uid,'out','Reserva','pl-reserva',3000,'monthly','2027-01',null,null,'{"2027-01":500,"2027-02":500,"2027-03":500,"2027-04":500,"2027-05":500,"2027-06":500,"2027-07":500,"2027-08":500,"2027-09":500,"2027-10":500,"2027-11":500,"2027-12":1500,"2029-01":5000,"2029-02":5000,"2029-03":5000,"2029-04":5000,"2029-05":5000,"2029-06":5000,"2029-07":5000,"2029-08":5000,"2029-09":5000,"2029-10":5000,"2029-11":5000,"2029-12":5000}'::jsonb,0),
    (v_uid,'out','Role','pl-role',1800,'monthly','2026-09',null,null,'{"2026-09":60}'::jsonb,0);

  raise notice 'Importacao concluida: 40 compromissos.';
end $$;
