-- Exclusivement dans une transaction annulee. Aucune piece ni identite reelle.
do $fixture$ declare d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();chemin text;begin
 perform set_config('cloison.complement_dossier',d::text,true);
 perform set_config('cloison.complement_membre',u::text,true);
 perform set_config('cloison.complement_piece',p::text,true);
 insert into public.agences(id,nom,domaine) values(a,'Essai complement','complement-'||replace(a::text,'-','')||'.invalid');
 insert into auth.users(id,email,email_confirmed_at) values(u,'essai@complement-'||replace(a::text,'-','')||'.invalid',now());
 insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
 insert into public.dossiers(id,agence_id,email_locataire,loyer_cents) values(d,a,'complement@example.invalid',100000);
 insert into public.engagements(dossier_id,revenu_net_mensuel_cents) values(d,300000);
 chemin:=d::text||'/'||p::text;
 insert into public.reservations_depot(chemin,dossier_id) values(chemin,d);
 insert into storage.objects(bucket_id,name) values('pieces',chemin);
 insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values(p,d,'piece_identite',chemin,100,'application/pdf');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $agence$ begin
 if public.demander_complement(current_setting('cloison.complement_piece')::uuid,'illisible') is distinct from true then raise exception 'Demande refusee';end if;
 perform set_config('cloison.complement_id',(select id::text from public.complements_documentaires where dossier_id=current_setting('cloison.complement_dossier')::uuid),true);
end $agence$;
reset role;
do $garant$ declare j uuid:=gen_random_uuid();p uuid:=gen_random_uuid();d uuid:=current_setting('cloison.complement_dossier')::uuid;chemin text;begin
 insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values(d,'garant',j,now()+interval '1 day');
 chemin:=d::text||'/'||p::text;
 insert into public.reservations_depot(chemin,dossier_id) values(chemin,d);
 insert into storage.objects(bucket_id,name) values('pieces',chemin);
 insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel,depose_le) values(p,d,'piece_identite',chemin,100,'application/pdf',clock_timestamp());
 perform set_config('cloison.complement_nouveau',p::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','role_partie','garant','dossier_id',d,'jti',j)::text,true);
end $garant$;
set local role porteur_lien;
do $fourniture$ begin
 if public.fournir_complement(current_setting('cloison.complement_id')::uuid,current_setting('cloison.complement_piece')::uuid) is distinct from false then raise exception 'Ancien fichier accepte';end if;
 if public.fournir_complement(current_setting('cloison.complement_id')::uuid,current_setting('cloison.complement_nouveau')::uuid) is distinct from true then raise exception 'Remplacement refuse';end if;
end $fourniture$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.complement_membre'),'aal','aal2')::text,true);
set local role authenticated;
do $validation$ begin
 if public.valider_complement(current_setting('cloison.complement_id')::uuid) is distinct from true then raise exception 'Validation refusee';end if;
end $validation$;
reset role;
do $controle$ declare j uuid:=gen_random_uuid();d uuid:=current_setting('cloison.complement_dossier')::uuid;begin
 if (select count(*) from public.journal_acces where dossier_id=d and action like 'complement_%')<>3 then raise exception 'Traces manquantes';end if;
 insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values(d,'locataire',j,now()+interval '1 day');
 perform set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','role_partie','locataire','dossier_id',d,'jti',j)::text,true);
end $controle$;
set local role porteur_lien;
do $cloison$ begin
 if exists(select 1 from public.complements_documentaires) then raise exception 'Complement visible au locataire';end if;
 if public.fournir_complement(current_setting('cloison.complement_id')::uuid,current_setting('cloison.complement_nouveau')::uuid) is distinct from false then raise exception 'Locataire autorise';end if;
end $cloison$;
reset role;
select set_config('request.jwt.claims','{}',true);
