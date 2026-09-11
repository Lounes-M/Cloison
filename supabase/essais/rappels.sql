-- Transaction annulee : uniquement une agence et des utilisateurs fictifs.
do $fixture$ declare a uuid:=gen_random_uuid();d uuid:=gen_random_uuid();u uuid:=gen_random_uuid();m uuid:=gen_random_uuid();n uuid:=gen_random_uuid();v uuid;begin
 perform set_config('cloison.responsable_agence',a::text,true);
 perform set_config('cloison.responsable_dossier',d::text,true);
 perform set_config('cloison.responsable_admin',u::text,true);
 perform set_config('cloison.responsable_premier',m::text,true);
 perform set_config('cloison.responsable_second',n::text,true);
 insert into public.agences(id,nom,domaine) values(a,'Essai responsable','responsable-'||replace(a::text,'-','')||'.invalid');
 foreach v in array array[u,m,n] loop
 insert into auth.users(id,email,email_confirmed_at) values(v,v::text||'@responsable-'||replace(a::text,'-','')||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,v,case when v=u then 'admin' else 'membre' end);
 end loop;
 insert into public.dossiers(id,agence_id,email_locataire,loyer_cents) values(d,a,'responsable@example.invalid',100000);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
update public.agences set siren='123456789',carte_pro='TEST' where id=current_setting('cloison.responsable_agence')::uuid;
update public.agences set statut='verifiee',verifiee_le=now() where id=current_setting('cloison.responsable_agence')::uuid;
update public.dossiers set statut='depot_en_cours',email_garant='rappel@example.invalid',expire_le=now()+interval '2 days' where id=current_setting('cloison.responsable_dossier')::uuid;
update public.dossiers set activite_rappel_le=now()-interval '8 days' where id=current_setting('cloison.responsable_dossier')::uuid;
set local role authenticated;
do $reglages$ declare r uuid;refuse boolean:=false;begin
 if (select relance_jours from public.reglages_rappels_agence())<>0 then raise exception 'Rappels actifs par defaut';end if;
 r:=public.regler_rappels(3,0,null);
 if r is null then raise exception 'Reglages refuses';end if;
 if public.regler_rappels(7,3,null) is not null then raise exception 'Revision ancienne acceptee';end if;
 begin update public.reglages_rappels set relance_jours=14;exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Reglages modifiables directement';end if;
end $reglages$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cloison.responsable_premier'),'aal','aal2')::text,true);
set local role authenticated;
do $membre$ begin
 if public.regler_rappels(7,3,null) is not null or exists(select 1 from public.reglages_rappels_agence()) then raise exception 'Reglages ouverts au membre';end if;
end $membre$;
reset role;
do $roles$ declare r text;sql text;refuse boolean;begin
 foreach r in array array['anon','authenticated','porteur_lien','depot_piece','service_role'] loop
 execute format('set local role %I',r);
 foreach sql in array array['select * from public.rappels_dossiers','select public.programmer_rappels()','select * from public.rappels_a_preparer()', 'select public.confirmer_rappel_avant_envoi(gen_random_uuid(),gen_random_uuid())'] loop
 refuse:=false;begin execute sql;exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Rappels ouverts a un role interdit';end if;
 end loop;reset role;
 end loop;
end $roles$;
set local role serveur;
do $file$ declare r uuid;b uuid;begin
 if public.programmer_rappels()<>1 then raise exception 'Planification incorrecte';end if;
 if public.programmer_rappels()<>0 then raise exception 'Rappel duplique';end if;
 select id into r from public.rappels_a_preparer() where dossier_id=current_setting('cloison.responsable_dossier')::uuid;
 if r is null or public.mettre_rappel_en_file(r,'chiffre-fictif')<>'prepare' then raise exception 'Preparation incorrecte';end if;
 select bail into b from public.prendre_courriels(r);
 if b is null or public.confirmer_rappel_avant_envoi(r,b)<>'pret' then raise exception 'Bail non confirme';end if;
 if public.confirmer_rappel_avant_envoi(r,null)<>'refuse' then raise exception 'Bail absent accepte';end if;
 perform set_config('cloison.rappel_id',r::text,true);perform set_config('cloison.rappel_bail',b::text,true);
end $file$;
reset role;
update public.dossiers set email_garant='autre@example.invalid' where id=current_setting('cloison.responsable_dossier')::uuid;
set local role serveur;
do $obsolete$ begin
 if public.confirmer_rappel_avant_envoi(current_setting('cloison.rappel_id')::uuid,current_setting('cloison.rappel_bail')::uuid)<>'annule' then raise exception 'Rappel obsolete envoye';end if;
end $obsolete$;
reset role;
do $efface$ begin
 if exists(select 1 from public.courriels_sortants where id=current_setting('cloison.rappel_id')::uuid and (contenu is not null or annule_le is null or bail is not null)) then raise exception 'Contenu obsolete conserve';end if;
end $efface$;
