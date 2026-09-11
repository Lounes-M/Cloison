-- Fixture privee : executer sous transaction puis annuler.
select set_config('cloison.brouillon_dossier',gen_random_uuid()::text,true);
select set_config('cloison.brouillon_jti',gen_random_uuid()::text,true);
insert into public.dossiers(id,email_locataire,reference)
values(current_setting('cloison.brouillon_dossier')::uuid,'brouillon@fixture.invalid','BR'||substr(current_setting('cloison.brouillon_dossier'),1,10));
insert into public.jetons_actifs(dossier_id,partie,jti,expire_le)
values(current_setting('cloison.brouillon_dossier')::uuid,'garant',current_setting('cloison.brouillon_jti')::uuid,clock_timestamp()+interval '1 day');
select set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','role_partie','garant','dossier_id',current_setting('cloison.brouillon_dossier'),'jti',current_setting('cloison.brouillon_jti'))::text,true);
set local role porteur_lien;
do $$ declare r uuid; suivant uuid; begin
 r:=public.sauver_brouillon_engagement(decode(repeat('ab',48),'hex'),0,null);
 if r is null or (select count(*) from public.mon_brouillon_engagement())<>1 then raise exception 'Sauvegarde non confirmee';end if;
 if public.sauver_brouillon_engagement(decode(repeat('cd',48),'hex'),0,null) is not null then raise exception 'Conflit non refuse';end if;
 suivant:=public.sauver_brouillon_engagement(null,0,r);
 if suivant is null or (select chiffre from public.mon_brouillon_engagement()) is not null then raise exception 'Suppression non confirmee';end if;
 if public.sauver_brouillon_engagement(decode(repeat('cd',48),'hex'),0,r) is not null then raise exception 'Revision supprimee reutilisee';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','role_partie','locataire','dossier_id',current_setting('cloison.brouillon_dossier'),'jti',current_setting('cloison.brouillon_jti'))::text,true);
do $$ begin
 if exists(select 1 from public.mon_brouillon_engagement()) or public.sauver_brouillon_engagement(decode(repeat('cd',48),'hex'),0,null) is not null then raise exception 'Acces locataire non refuse';end if;
end $$;
reset role;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','serveur','depot_piece','service_role'] loop
  if has_function_privilege(r,'public.mon_brouillon_engagement()','execute') or has_table_privilege(r,'public.brouillons_engagement','select') then raise exception 'Privilege inattendu';end if;
 end loop;
end $$;
