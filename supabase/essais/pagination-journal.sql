-- Fixtures exclusivement transactionnelles, a annuler apres verification.
do $fixture$ declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();autre uuid:=gen_random_uuid();jti uuid:=gen_random_uuid(); begin
 insert into public.agences(id,nom,domaine) values(a,'Journal fictif',a::text||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'agent@'||a::text||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
 insert into public.dossiers(id,agence_id,email_locataire) values(d,a,'locataire@example.invalid'),(autre,null,'autre@example.invalid');
 insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values(d,'garant',jti,now()+interval '1 day');
 insert into public.journal_acces(dossier_id,acteur,acteur_id,action) select d,'agence',u,'dossier_consulte' from generate_series(1,55);
 insert into public.journal_acces(dossier_id,acteur,action) values(autre,'garant','dossier_consulte');
 perform set_config('cloison.journal_dossier',d::text,true);perform set_config('cloison.journal_autre',autre::text,true);perform set_config('cloison.journal_utilisateur',u::text,true);
 perform set_config('cloison.journal_claims',jsonb_build_object('role','porteur_lien','role_partie','garant','dossier_id',d,'jti',jti)::text,true);
 perform set_config('request.jwt.claims',current_setting('cloison.journal_claims'),true);
end $fixture$;
set local role porteur_lien;
do $pagination$ declare d uuid:=current_setting('cloison.journal_dossier')::uuid;p record;begin
 if(select count(*) from public.journal_du_dossier(d))<>51 then raise exception 'Journal non borne';end if;
 select id,quand into p from public.journal_du_dossier(d) offset 49 limit 1;
 if(select count(*) from public.journal_du_dossier(d,p.quand,p.id))<>5 then raise exception 'Evenements omis';end if;
 if exists(select 1 from public.journal_du_dossier(current_setting('cloison.journal_autre')::uuid)) then raise exception 'Journal etranger expose';end if;
end $pagination$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.journal_utilisateur'),'aal','aal2')::text,true);
set local role authenticated;
do $agence$ begin
 if(select count(*) from public.journal_du_dossier(current_setting('cloison.journal_dossier')::uuid))<>51 then raise exception 'Journal agence indisponible';end if;
 if exists(select 1 from public.journal_du_dossier(current_setting('cloison.journal_autre')::uuid)) then raise exception 'Journal autre agence expose';end if;
end $agence$;
reset role;
update auth.users set email='personnel@example.invalid' where id=current_setting('cloison.journal_utilisateur')::uuid;
select set_config('request.jwt.claims',current_setting('cloison.journal_claims'),true);
set local role porteur_lien;
do $identite$ begin
 if exists(select 1 from public.journal_du_dossier(current_setting('cloison.journal_dossier')::uuid) where identite is not null)
 or exists(select 1 from public.mon_journal_acces() where identite is not null) then raise exception 'Adresse personnelle exposee';end if;
end $identite$;
reset role;
do $droits$ begin
 if exists(select 1 from unnest(array['anon','serveur','depot_piece']) r where has_function_privilege(r,'public.journal_du_dossier(uuid,timestamptz,uuid)','execute')) then raise exception 'Journal ouvert a un role inutile';end if;
end $droits$;
