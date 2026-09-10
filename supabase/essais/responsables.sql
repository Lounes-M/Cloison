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
set local role authenticated;
do $affectation$ declare r uuid;refuse boolean:=false;begin
 r:=public.affecter_dossier(current_setting('cloison.responsable_dossier')::uuid,current_setting('cloison.responsable_premier')::uuid);
 if r is null then raise exception 'Affectation refusee';end if;
 perform set_config('cloison.responsable_revision',r::text,true);
 if public.affecter_dossier(current_setting('cloison.responsable_dossier')::uuid,current_setting('cloison.responsable_second')::uuid) is not null then raise exception 'Revision obsolete acceptee';end if;
 if (select count(*) from public.responsables_des_dossiers(array[current_setting('cloison.responsable_dossier')::uuid]) where responsable_id=current_setting('cloison.responsable_premier')::uuid)<>1 then raise exception 'Projection responsable incorrecte';end if;
 begin update public.affectations_dossiers set membre_id=null;exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Affectation modifiable directement';end if;
end $affectation$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.responsable_second'),'aal','aal2')::text,true);
set local role authenticated;
do $collegue$ begin
 if public.affecter_dossier(current_setting('cloison.responsable_dossier')::uuid,current_setting('cloison.responsable_second')::uuid,current_setting('cloison.responsable_revision')::uuid) is not null then raise exception 'Dossier vole par un collegue';end if;
 if public.affecter_dossier(current_setting('cloison.responsable_dossier')::uuid,null,current_setting('cloison.responsable_revision')::uuid) is not null then raise exception 'Dossier libere par un collegue';end if;
end $collegue$;
reset role;
do $roles$ declare r text;refuse boolean;begin
 foreach r in array array['anon','porteur_lien','serveur','depot_piece','service_role'] loop
 execute format('set local role %I',r);refuse:=false;
 begin perform public.affecter_dossier(current_setting('cloison.responsable_dossier')::uuid,null,current_setting('cloison.responsable_revision')::uuid);exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Affectation ouverte';end if;
 refuse:=false;
 begin perform * from public.responsables_des_dossiers(array[current_setting('cloison.responsable_dossier')::uuid]);exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Projection responsable ouverte';end if;
 reset role;
 end loop;
end $roles$;
delete from public.membres_agence where utilisateur_id=current_setting('cloison.responsable_premier')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.responsable_admin'),'aal','aal2')::text,true);
set local role authenticated;
do $exclusion$ begin
 if exists(select 1 from public.responsables_des_dossiers(array[current_setting('cloison.responsable_dossier')::uuid]) where responsable_id is not null or revision=current_setting('cloison.responsable_revision')::uuid) then raise exception 'Exclusion conserve une affectation';end if;
end $exclusion$;
reset role;
