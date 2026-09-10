-- Exclusivement dans une transaction annulee ; identites et empreintes fictives.
do $fixture$ declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();begin
 perform set_config('cloison.connecteur_agence',a::text,true);
 perform set_config('cloison.connecteur_membre',u::text,true);
 perform set_config('cloison.connecteur_hash',encode(gen_random_bytes(32),'hex'),true);
 insert into public.agences(id,nom,domaine) values(a,'Essai connecteur','connecteur-'||replace(a::text,'-','')||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'essai@connecteur-'||replace(a::text,'-','')||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
 insert into public.dossiers(id,agence_id,reference,email_locataire,loyer_cents) values(d,a,'CONNECTEUR'||left(replace(d::text,'-',''),20),'fixture@example.invalid',123456);
 perform set_config('cloison.connecteur_reference',(select reference from public.dossiers where id=d),true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $admin$ declare id uuid;refuse boolean:=false;begin
 id:=public.creer_connecteur('Logiciel fictif',current_setting('cloison.connecteur_hash'));
 if id is null then raise exception 'Creation connecteur refusee';end if;
 perform set_config('cloison.connecteur_id',id::text,true);
 begin perform empreinte from public.connecteurs_agence;exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Empreinte connecteur lisible';end if;
end $admin$;
reset role;
set local role serveur;
do $lecture$ declare r jsonb;begin
 r:=public.lire_statuts_connecteur(current_setting('cloison.connecteur_hash'));
 if r is distinct from jsonb_build_object('version',1,'dossiers',jsonb_build_array(jsonb_build_object('reference',current_setting('cloison.connecteur_reference'),'etat','a_completer')),'suite',null) then raise exception 'Projection connecteur incorrecte';end if;
end $lecture$;
reset role;
do $roles$ declare r text;refuse boolean;begin
 foreach r in array array['anon','authenticated','porteur_lien','depot_piece','service_role'] loop
 execute format('set local role %I',r);refuse:=false;
 begin perform public.lire_statuts_connecteur(current_setting('cloison.connecteur_hash'));exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Projection connecteur ouverte';end if;
 reset role;
 end loop;
end $roles$;
set local role authenticated;
do $retrait$ begin if public.revoquer_connecteur(current_setting('cloison.connecteur_id')::uuid) is distinct from true then raise exception 'Revocation refusee';end if;end $retrait$;
reset role;
set local role serveur;
do $refus$ begin if public.lire_statuts_connecteur(current_setting('cloison.connecteur_hash')) is not null then raise exception 'Cle revoquee utilisable';end if;end $refus$;
reset role;

do $seconde$ declare u uuid:=gen_random_uuid();a uuid:=current_setting('cloison.connecteur_agence')::uuid;begin
 perform set_config('cloison.connecteur_second',u::text,true);
 perform set_config('cloison.connecteur_hash',encode(gen_random_bytes(32),'hex'),true);
 insert into auth.users(id,email,email_confirmed_at) select u,'second@'||domaine,now() from public.agences where id=a;
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
end $seconde$;
set local role authenticated;
do $nouvelle$ begin
 if public.creer_connecteur('Cle avant exclusion',current_setting('cloison.connecteur_hash')) is null then raise exception 'Nouvelle cle refusee';end if;
end $nouvelle$;
reset role;
delete from public.membres_agence where agence_id=current_setting('cloison.connecteur_agence')::uuid and utilisateur_id=current_setting('cloison.connecteur_membre')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.connecteur_second'),'aal','aal2')::text,true);
set local role authenticated;
do $readmission$ begin
 if public.readmettre_collaborateur(current_setting('cloison.connecteur_membre')::uuid) is distinct from true then raise exception 'Readmission refusee';end if;
end $readmission$;
reset role;
insert into public.membres_agence(agence_id,utilisateur_id,role) values(current_setting('cloison.connecteur_agence')::uuid,current_setting('cloison.connecteur_membre')::uuid,'membre');
set local role serveur;
do $non_reactivation$ begin
 if public.lire_statuts_connecteur(current_setting('cloison.connecteur_hash')) is not null then raise exception 'Readmission reactive la cle';end if;
end $non_reactivation$;
reset role;
