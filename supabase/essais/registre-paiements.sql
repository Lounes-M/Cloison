-- Fixture financiere uniquement ; executer dans une transaction annulee.
do $fixture$ declare d uuid:=gen_random_uuid(); s text:=replace(d::text,'-',''); begin
 perform set_config('cloison.finance_dossier',d::text,true);
 perform set_config('cloison.finance_suffixe',s,true);
 perform set_config('cloison.finance_date',now()::text,true);
 insert into public.dossiers(id,email_locataire) values(d,'finance-fictive@example.invalid');
 insert into public.tarifs_paiement(version,montant_cents,devise) values('fixture-'||s,1200,'eur');
end $fixture$;
set local role serveur;
do $essai$ declare d uuid:=current_setting('cloison.finance_dossier')::uuid; s text:=current_setting('cloison.finance_suffixe'); t timestamptz:=current_setting('cloison.finance_date')::timestamptz; r jsonb; begin
 if public.enregistrer_suivi_paiement('evt_ref_'||s,'pi_'||s,'ch_'||s,'remboursement',500,'eur','rembourse',t,'cs_'||s,d) is distinct from true then raise exception 'Suivi refuse';end if;
 r:=public.enregistrer_paiement_locataire('evt_'||s,'cs_'||s,'pi_'||s,d,900,'eur','locataire-2026-09-04',t);
 if r<>jsonb_build_object('marque',true,'anomalie',false) then raise exception 'Paiement non confirme';end if;
 if public.enregistrer_paiement_locataire('evt_'||s,'cs_'||s,'pi_'||s,d,900,'eur','locataire-2026-09-04',t)<>r then raise exception 'Rejeu different';end if;
 if public.reserver_rapprochement('cs_'||s) is distinct from true or public.reserver_rapprochement('cs_'||s) is distinct from false then raise exception 'Reservation concurrente non protegee';end if;
 if public.rapprocher_paiement('cs_'||s,'pi_'||s,d,900,'eur','locataire-2026-09-04',true) is distinct from true then raise exception 'Rapprochement refuse';end if;
end $essai$;
reset role;
do $lecture$ declare d uuid:=current_setting('cloison.finance_dossier')::uuid;s text:=current_setting('cloison.finance_suffixe');begin
 if (select count(*) from public.evenements_paiements where source_dossier=d)<>2 then raise exception 'Evenement duplique';end if;
 if (select count(*) from public.rapprochements_paiements where reference_session='cs_'||s)<>1 then raise exception 'Trace de rapprochement absente';end if;
 begin update public.tarifs_paiement set montant_cents=1300 where version='fixture-'||s;raise exception 'Tarif modifiable';exception when check_violation then null;end;
 delete from public.dossiers where id=d;
 if not exists(select 1 from public.registre_paiements where reference_session='cs_'||s and dossier_id is null and marque) then raise exception 'Historique perdu avec le dossier';end if;
end $lecture$;
set local role serveur;
do $rejeu$ declare d uuid:=current_setting('cloison.finance_dossier')::uuid;s text:=current_setting('cloison.finance_suffixe');t timestamptz:=current_setting('cloison.finance_date')::timestamptz;begin
 if (public.enregistrer_paiement_locataire('evt_'||s,'cs_'||s,'pi_'||s,d,900,'eur','locataire-2026-09-04',t)->>'marque')::boolean is distinct from true then raise exception 'Historique de paiement perdu';end if;
end $rejeu$;
reset role;
do $droits$ declare r text;begin
 if exists(select 1 from public.dossiers where id=current_setting('cloison.finance_dossier')::uuid) then raise exception 'Dossier purge recree';end if;
 foreach r in array array['anon','authenticated','porteur_lien','depot_piece'] loop
  if has_table_privilege(r,'public.registre_paiements','select') or has_table_privilege(r,'public.evenements_paiements','select') or has_table_privilege(r,'public.rapprochements_paiements','select') or has_function_privilege(r,'public.enregistrer_paiement_locataire(text,text,text,uuid,integer,text,text,timestamptz)','execute') or has_function_privilege(r,'public.rapprocher_paiement(text,text,uuid,integer,text,text,boolean)','execute') then raise exception 'Droits financiers trop larges';end if;
 end loop;
end $droits$;

do $tarif_fixture$ declare d uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); begin
 insert into public.dossiers(id,email_locataire) values(d,'tarif-fictif@example.invalid');
 insert into public.sessions_paiement(dossier_id) values(d);
 insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values(d,'locataire',j,now()+interval '1 hour');
 perform set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','dossier_id',d,'role_partie','locataire','jti',j)::text,true);
end $tarif_fixture$;
set local role porteur_lien;
do $tarif_propre$ begin
 if (select count(*) from public.mon_tarif_paiement() where montant_cents=900 and devise='eur' and tarif_version='locataire-2026-09-04')<>1 then raise exception 'Tarif propre inaccessible';end if;
end $tarif_propre$;
reset role;
do $changer_partie$ declare j uuid:=gen_random_uuid(); d uuid:=(current_setting('request.jwt.claims')::jsonb->>'dossier_id')::uuid;begin
 insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values(d,'garant',j,now()+interval '1 hour');
 perform set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','dossier_id',d,'role_partie','garant','jti',j)::text,true);
end $changer_partie$;
set local role porteur_lien;
do $tarif_refuse$ begin
 if exists(select 1 from public.mon_tarif_paiement()) then raise exception 'Le garant lit le tarif locataire';end if;
end $tarif_refuse$;
reset role;
