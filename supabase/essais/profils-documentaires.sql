-- Metadonnees fictives, sans objet Storage. A executer uniquement sous BEGIN/ROLLBACK.
do $fixture$ declare d uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); n text;begin
 perform set_config('cloison.profil_dossier',d::text,true);
 perform set_config('cloison.profil_piece',p::text,true);
 perform set_config('cloison.profil_garant',g::text,true);
 perform set_config('cloison.profil_locataire',l::text,true);
 insert into public.dossiers(id,email_locataire,loyer_cents) values(d,'profil-fictif@example.invalid',100000);
 insert into public.engagements(dossier_id,revenu_net_mensuel_cents) values(d,300000);
 foreach n in array array['avis_imposition','piece_identite','justificatif_domicile'] loop
  insert into public.pieces(dossier_id,type,chemin,taille_octets,type_reel) values(d,n,d::text||'/'||gen_random_uuid()::text,100,'application/pdf');
 end loop;
 insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values(p,d,'bulletin_paie',d::text||'/'||p::text,100,'application/pdf');
 insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values(d,'garant',g,now()+interval '1 hour'),(d,'locataire',l,now()+interval '1 hour');
 if (select statut from public.dossiers where id=d)<>'depot_en_cours' then raise exception 'Un bulletin est compte comme trois';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','dossier_id',d,'role_partie','locataire','jti',l)::text,true);
end $fixture$;
set local role porteur_lien;
do $locataire$ begin
 if exists(select profil_ressources from public.engagements where dossier_id=current_setting('cloison.profil_dossier')::uuid) then raise exception 'Profil visible du locataire';end if;
 if public.declarer_nombre_documents(current_setting('cloison.profil_piece')::uuid,3) is distinct from false then raise exception 'Correction par le locataire';end if;
end $locataire$;
reset role;
do $claims$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','dossier_id',current_setting('cloison.profil_dossier'),'role_partie','garant','jti',current_setting('cloison.profil_garant'))::text,true);
end $claims$;
set local role porteur_lien;
do $garant$ begin
 if public.declarer_nombre_documents(current_setting('cloison.profil_piece')::uuid,3) is distinct from true then raise exception 'Declaration refusee';end if;
 if (select statut from public.dossiers where id=current_setting('cloison.profil_dossier')::uuid)<>'complet' then raise exception 'Groupe non compte';end if;
 update public.engagements set profil_ressources='retraite' where dossier_id=current_setting('cloison.profil_dossier')::uuid;
 if (select statut from public.dossiers where id=current_setting('cloison.profil_dossier')::uuid)<>'depot_en_cours' then raise exception 'Profil non recalcule';end if;
end $garant$;
reset role;
do $pension$ declare d uuid:=current_setting('cloison.profil_dossier')::uuid;begin
 insert into public.pieces(dossier_id,type,chemin,taille_octets,type_reel) values(d,'pension_retraite',d::text||'/'||gen_random_uuid()::text,100,'application/pdf');
 if (select statut from public.dossiers where id=d)<>'complet' then raise exception 'Droits a pension non comptes';end if;
end $pension$;
do $droits$ declare r text;begin
 foreach r in array array['anon','authenticated','serveur','depot_piece'] loop
  if has_function_privilege(r,'public.declarer_nombre_documents(uuid,integer)','execute') then raise exception 'Correction exposee au mauvais role';end if;
 end loop;
 if has_column_privilege('porteur_lien','public.pieces','nombre_documents','update') then raise exception 'Correction directe exposee';end if;
end $droits$;
