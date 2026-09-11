-- Transaction annulee : agence et comptes exclusivement fictifs.
do $fixture$ declare a uuid:=gen_random_uuid();d uuid:=gen_random_uuid();u uuid:=gen_random_uuid();m uuid:=gen_random_uuid();begin
 perform set_config('cloison.historique_agence',a::text,true);
 perform set_config('cloison.historique_dossier',d::text,true);
 perform set_config('cloison.historique_admin',u::text,true);
 perform set_config('cloison.historique_membre',m::text,true);
 insert into public.agences(id,nom,domaine) values(a,'Essai historique','historique-'||replace(a::text,'-','')||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'admin@historique-'||replace(a::text,'-','')||'.invalid',now()),(m,'membre@historique-'||replace(a::text,'-','')||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin'),(a,m,'membre');
 insert into public.dossiers(id,agence_id,email_locataire,loyer_cents) values(d,a,'historique@example.invalid',100000);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $trace$ declare d uuid:=current_setting('cloison.historique_dossier')::uuid;r uuid;begin
 r:=public.affecter_dossier(d,current_setting('cloison.historique_membre')::uuid,null);
 if r is null then raise exception 'Affectation fictive refusee';end if;
 if (select count(*) from public.historique_responsables_du_dossier(d))<>1 then raise exception 'Affectation non tracee';end if;
 if public.affecter_dossier(d,null,null) is not null then raise exception 'Revision ancienne acceptee';end if;
 if (select count(*) from public.historique_responsables_du_dossier(d))<>1 then raise exception 'Conflit trace comme succes';end if;
end $trace$;
reset role;
do $roles$ declare r text;refuse boolean;d uuid:=current_setting('cloison.historique_dossier')::uuid;begin
 foreach r in array array['anon','authenticated','porteur_lien','serveur','depot_piece','service_role'] loop
  execute format('set local role %I',r);refuse:=false;
  begin perform * from public.historique_responsables;exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Table historique ouverte';end if;
  if r<>'authenticated' then
   refuse:=false;begin perform * from public.historique_responsables_du_dossier(d);exception when insufficient_privilege then refuse:=true;end;
   if not refuse then raise exception 'Historique expose a un role interdit';end if;
  end if;
  reset role;
 end loop;
 begin update public.historique_responsables set auteur=null where dossier_id=d;raise exception 'Modification acceptee';
 exception when raise_exception then if sqlerrm<>'Historique des responsables immuable' then raise;end if;end;
 begin delete from public.historique_responsables where dossier_id=d;raise exception 'Suppression acceptee';
 exception when raise_exception then if sqlerrm<>'Historique des responsables immuable' then raise;end if;end;
end $roles$;
delete from auth.users where id=current_setting('cloison.historique_membre')::uuid;
set local role authenticated;
do $depart$ declare d uuid:=current_setting('cloison.historique_dossier')::uuid;begin
 if (select count(*) from public.historique_responsables_du_dossier(d))<>2 then raise exception 'Depart non trace';end if;
 if exists(select 1 from public.historique_responsables_du_dossier(d) where precedent_email is not null or suivant_email is not null) then raise exception 'Adresse du compte supprime conservee';end if;
end $depart$;
reset role;
update public.dossiers set statut='signe',cree_le=now()-interval '4 months',expire_le=now()-interval '1 day' where id=current_setting('cloison.historique_dossier')::uuid;
set local role authenticated;
do $expire$ begin if exists(select 1 from public.historique_responsables_du_dossier(current_setting('cloison.historique_dossier')::uuid)) then raise exception 'Historique expire lisible';end if;end $expire$;
reset role;
set local role serveur;
do $appel$ begin perform public.purger_historique_responsables();end $appel$;
reset role;
do $purge$ begin if exists(select 1 from public.historique_responsables where dossier_id=current_setting('cloison.historique_dossier')::uuid) then raise exception 'Historique expire conserve';end if;end $purge$;
