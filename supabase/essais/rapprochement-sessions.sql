-- Fixtures fictives, uniquement sous BEGIN/ROLLBACK. Aucun appel fournisseur.
do $fixture$ declare d uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); r text:='cs_fictif_'||replace(gen_random_uuid()::text,'-','');begin
 perform set_config('cloison.rapprochement_dossier',d::text,true);
 perform set_config('cloison.rapprochement_autre',a::text,true);
 perform set_config('cloison.rapprochement_reference',r,true);
 insert into public.dossiers(id,email_locataire) values(d,'rapprochement-fictif@example.invalid'),(a,'autre-fictif@example.invalid');
 insert into public.sessions_paiement(dossier_id,session_ref,cree_le) values(d,r,'-infinity'::timestamptz);
end $fixture$;
set local role serveur;
do $file$ begin
 if not exists(select 1 from public.paiements_a_rapprocher() where reference_session=current_setting('cloison.rapprochement_reference')) then raise exception 'Session sans webhook oubliee';end if;
 if public.reserver_rapprochement(current_setting('cloison.rapprochement_reference')) is distinct from true then raise exception 'Reservation non confirmee';end if;
 if exists(select 1 from public.paiements_a_rapprocher() where reference_session=current_setting('cloison.rapprochement_reference')) then raise exception 'Reservation repetee trop tot';end if;
 if public.rapprocher_paiement(current_setting('cloison.rapprochement_reference'),'pi_fictif_'||replace(gen_random_uuid()::text,'-',''),current_setting('cloison.rapprochement_autre')::uuid,900,'eur','locataire-2026-09-04',true) is distinct from true then raise exception 'Anomalie non enregistree';end if;
end $file$;
reset role;
do $controle$ declare r text;begin
 if not exists(select 1 from public.registre_paiements where reference_session=current_setting('cloison.rapprochement_reference') and anomalie and not marque) then raise exception 'Reference etrangere creditee';end if;
 if exists(select 1 from public.dossiers where id=current_setting('cloison.rapprochement_autre')::uuid and paye_le is not null) then raise exception 'Dossier etranger credite';end if;
 foreach r in array array['anon','authenticated','porteur_lien','depot_piece'] loop
  if has_function_privilege(r,'public.paiements_a_rapprocher()','execute') or has_function_privilege(r,'public.rapprocher_paiement(text,text,uuid,integer,text,text,boolean)','execute') then raise exception 'Fonction financiere exposee';end if;
 end loop;
end $controle$;
