-- Cloture d'un dossier par l'agence, avant son echeance.
--
-- Un candidat se retire, un logement est loue a quelqu'un d'autre : jusqu'ici
-- le dossier attendait son echeance (trente jours, ou trois mois apres un
-- depot) avec les pieces du garant dedans. L'ADR 0003 fait de cette duree un
-- plafond, pas un delai a consommer. Cette fonction permet de l'avancer.
--
-- Effets, dans la meme transaction :
--   - statut `expire` et echeance a maintenant : la politique restrictive de
--     la 0033 ferme aussitot toute lecture agence, et la prochaine purge
--     detruit pieces, engagement, journal et objets Storage ;
--   - jetons et cle du dossier detruits tout de suite : les liens du
--     locataire et du garant ne valent plus rien, et les octets scelles
--     deviennent inertes sans attendre la maintenance ;
--   - notifications de statut en attente retirees : aucune ne partirait
--     d'un dossier echu, et celle que le declencheur pose pour `expire` non
--     plus. Le courriel de cloture est mis en file par l'application.
--
-- Garde-fous : agence courante en aal2 ; administrateur, ou responsable
-- attribue du dossier ; reference retapee a l'identique ; jamais un dossier
-- pris, signe, deja echu ou de demonstration. Un dossier pris se refuse
-- d'abord, ce que le declencheur de la 0058 interdit pendant une signature.

create function public.clore_dossier(le_dossier uuid, la_reference text)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 agence uuid:=public.agence_courante();
 d public.dossiers;
begin
 if agence is null or le_dossier is null or la_reference is null then return null;end if;
 select * into d from public.dossiers
  where id=le_dossier and agence_id=agence and expire_le>clock_timestamp()
  for update;
 if not found or d.demonstration or d.reference<>la_reference
  or d.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant','refuse') then
  return null;
 end if;
 if not public.est_admin_agence() and not exists(
  select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=auth.uid()) then
  return null;
 end if;
 -- `now()` et non l'horloge : la politique de la 0033 et la purge comparent a
 -- `now()`, qui doit voir le dossier echu des cette transaction.
 update public.dossiers set statut='expire',expire_le=greatest(now()-interval '1 millisecond',cree_le+interval '1 millisecond')
  where id=d.id;
 delete from public.jetons_actifs where dossier_id=d.id;
 delete from public.cles_dossier where dossier_id=d.id;
 delete from public.notifications_statut where dossier_id=d.id;
 return jsonb_build_object('reference',d.reference,'email_locataire',d.email_locataire,
  'email_garant',d.email_garant);
end;
$$;
revoke all on function public.clore_dossier(uuid,text)
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.clore_dossier(uuid,text) to authenticated;
