-- Sous ROLLBACK : aucune piece reelle, aucun appel fournisseur.
do $fixture$
declare d uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); chemin text;
begin
 perform set_config('cloison.ocr_dossier',d::text,true);
 perform set_config('cloison.ocr_membre',u::text,true);
 perform set_config('cloison.ocr_piece',p::text,true);
 insert into public.agences(id,nom,domaine) values(a,'Essai OCR','ocr-'||replace(a::text,'-','')||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'essai@ocr-'||replace(a::text,'-','')||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
 insert into public.dossiers(id,agence_id,email_locataire,loyer_cents) values(d,a,'ocr@example.invalid',100000);
 chemin:=d::text||'/'||p::text;
 insert into public.reservations_depot(chemin,dossier_id) values(chemin,d);
 insert into storage.objects(bucket_id,name) values('pieces',chemin);
 insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values(p,d,'piece_identite',chemin,100,'application/pdf');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $agence$ begin
 if public.reserver_lecture_ocr(gen_random_uuid()) is distinct from false then raise exception 'Piece absente acceptee';end if;
 for i in 1..5 loop
 if public.reserver_lecture_ocr(current_setting('cloison.ocr_piece')::uuid) is distinct from true then raise exception 'Reservation refusee';end if;
 end loop;
 if public.reserver_lecture_ocr(current_setting('cloison.ocr_piece')::uuid) is distinct from false then raise exception 'Quota contourne';end if;
end $agence$;
reset role;
do $droits$ declare r text; refuse boolean; begin
 if (select count(*) from public.journal_acces where dossier_id=current_setting('cloison.ocr_dossier')::uuid and action='ocr_demande' and acteur_id=current_setting('cloison.ocr_membre')::uuid)<>5 then raise exception 'Journal OCR incorrect';end if;
 foreach r in array array['anon','porteur_lien','serveur','service_role','depot_piece'] loop
 execute format('set local role %I',r); refuse:=false;
 begin perform public.reserver_lecture_ocr(current_setting('cloison.ocr_piece')::uuid); exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Role OCR ouvert';end if;
 reset role;
 end loop;
end $droits$;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.ocr_membre'),'aal','aal1')::text,true);
set local role authenticated;
do $mfa$ begin
 if public.reserver_lecture_ocr(current_setting('cloison.ocr_piece')::uuid) is distinct from false then raise exception 'MFA contournee';end if;
end $mfa$;
reset role;
