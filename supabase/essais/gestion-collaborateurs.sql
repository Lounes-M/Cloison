-- Entre BEGIN et ROLLBACK, aucun envoi fournisseur ni compte reel.
do $fixture$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
begin
 insert into public.agences(id,nom,domaine) values(a,'Equipe fictive',a::text||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'admin@'||a::text||'.invalid',now()),(v,'membre@'||a::text||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin'),(a,v,'membre');
 perform set_config('cloison.essai_membre',v::text,true);
 perform set_config('request.jwt.claims',json_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $droits$
declare cible uuid:=current_setting('cloison.essai_membre')::uuid;
begin
 if(select count(*) from public.collaborateurs_agence(0))<>2 then raise exception 'Equipe inattendue'; end if;
 delete from public.membres_agence where utilisateur_id=cible;
 if not public.readmettre_collaborateur(cible) then raise exception 'Readmission refusee'; end if;
 if(select count(*) from public.journal_de_mon_agence())<>2 then raise exception 'Trace incomplete'; end if;
 if has_table_privilege('authenticated','public.journal_administration_agence','delete') then raise exception 'Journal modifiable'; end if;
end $droits$;
reset role;
