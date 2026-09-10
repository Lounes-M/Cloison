-- Sous ROLLBACK, uniquement des identites et un objet fictifs.
do $fixture$ declare d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();chemin text;begin
 perform set_config('cloison.examen_dossier',d::text,true);
 perform set_config('cloison.examen_membre',u::text,true);
 perform set_config('cloison.examen_piece',p::text,true);
 insert into public.agences(id,nom,domaine) values(a,'Essai examen','examen-'||replace(a::text,'-','')||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'essai@examen-'||replace(a::text,'-','')||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
 insert into public.dossiers(id,agence_id,email_locataire,loyer_cents) values(d,a,'examen@example.invalid',100000);
 chemin:=d::text||'/'||p::text;
 insert into public.reservations_depot(chemin,dossier_id) values(chemin,d);
 insert into storage.objects(bucket_id,name) values('pieces',chemin);
 insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values(p,d,'piece_identite',chemin,100,'application/pdf');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $examen$ declare r uuid;refuse boolean:=false;begin
 r:=public.enregistrer_examen_documentaire(current_setting('cloison.examen_dossier')::uuid,current_setting('cloison.examen_piece')::uuid,'examine');
 if r is null then raise exception 'Examen refuse';end if;
 perform set_config('cloison.examen_revision',r::text,true);
 if public.enregistrer_examen_documentaire(current_setting('cloison.examen_dossier')::uuid,current_setting('cloison.examen_piece')::uuid,'a_revoir') is not null then raise exception 'Examen obsolete accepte';end if;
 if (select count(*) from public.examens_du_dossier(current_setting('cloison.examen_dossier')::uuid) where revision=r and etat='examine')<>1 then raise exception 'Lecture examen incorrecte';end if;
 begin update public.examens_documentaires set etat='a_revoir';exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Historique examen modifiable';end if;
end $examen$;
reset role;
do $roles$ declare r text;refuse boolean;begin
 foreach r in array array['anon','porteur_lien','serveur','depot_piece','service_role'] loop
 execute format('set local role %I',r);refuse:=false;
 begin perform public.enregistrer_examen_documentaire(current_setting('cloison.examen_dossier')::uuid,current_setting('cloison.examen_piece')::uuid,'a_revoir',current_setting('cloison.examen_revision')::uuid);exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Ecriture examen ouverte';end if;
 refuse:=false;
 begin perform * from public.examens_du_dossier(current_setting('cloison.examen_dossier')::uuid);exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Lecture examen ouverte';end if;
 reset role;
 end loop;
end $roles$;
update public.dossiers set cree_le=now()-interval '100 days',expire_le=now()-interval '1 day' where id=current_setting('cloison.examen_dossier')::uuid;
set local role authenticated;
do $expiration$ begin
 if exists(select 1 from public.examens_documentaires where dossier_id=current_setting('cloison.examen_dossier')::uuid) then raise exception 'Examen expire lisible';end if;
 if exists(select 1 from public.examens_du_dossier(current_setting('cloison.examen_dossier')::uuid)) then raise exception 'Projection expiree lisible';end if;
 if public.enregistrer_examen_documentaire(current_setting('cloison.examen_dossier')::uuid,current_setting('cloison.examen_piece')::uuid,'a_revoir',current_setting('cloison.examen_revision')::uuid) is not null then raise exception 'Examen expire accepte';end if;
end $expiration$;
reset role;
