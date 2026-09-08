-- A executer dans la repetition transactionnelle, avec rollback des fixtures.
do $fixture$ declare identifiant uuid:=gen_random_uuid(); begin
 perform set_config('cloison.essai_courriel',identifiant::text,true);
end $fixture$;
set local role serveur;
do $essai$ declare identifiant uuid:=current_setting('cloison.essai_courriel')::uuid; bail_fictif uuid; begin
 perform public.mettre_courriel_en_file(identifiant,'chiffre fictif');
 select bail into bail_fictif from public.prendre_courriels(identifiant);
 if not public.enregistrer_evenement_courriel('evt_'||identifiant::text,'resend_'||identifiant::text,identifiant,'email.delivered',now()) then raise exception 'Evenement refuse'; end if;
 if not public.acquitter_courriel(identifiant,bail_fictif,'resend_'||identifiant::text) then raise exception 'Acquittement apres webhook refuse'; end if;
end $essai$;
reset role;
do $droits$ begin
 if exists(select 1 from unnest(array['anon','authenticated','porteur_lien','depot_piece']) r where has_function_privilege(r,'public.enregistrer_evenement_courriel(text,text,uuid,text,timestamptz)','execute')) then raise exception 'Evenement forgeable'; end if;
 if exists(select 1 from unnest(array['anon','authenticated','porteur_lien','serveur','depot_piece']) r where has_table_privilege(r,'public.evenements_courriels','SELECT,INSERT,UPDATE,DELETE')) then raise exception 'Historique ouvert'; end if;
 if not exists(select 1 from public.courriels_sortants where id=current_setting('cloison.essai_courriel')::uuid and etat_livraison='livre' and contenu is null) then raise exception 'Suivi incomplet'; end if;
end $droits$;
