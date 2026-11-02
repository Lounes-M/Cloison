-- Tracer au journal la reprise manuelle des relances (0079).
--
-- Relancer le garant a nouveau est un geste d'un collaborateur nomme : il
-- figure desormais dans l'historique du dossier, comme la consultation ou
-- la prise, avec son auteur. Le garant le voit aussi dans son propre
-- historique, ce qui explique les nouvelles relances qu'il recoit.

alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse','ocr_demande',
 'relances_reprises'));

create or replace function public.relancer_garant(le_dossier uuid)
returns boolean
language plpgsql security definer set search_path='' as $$
declare
 agence uuid:=public.agence_courante();
 d public.dossiers;
begin
 if agence is null or le_dossier is null then return false;end if;
 select * into d from public.dossiers
  where id=le_dossier and agence_id=agence and expire_le>clock_timestamp()
  for update;
 if not found or d.demonstration or d.email_garant is null
  or d.statut not in ('ouvert','depot_en_cours') then
  return false;
 end if;
 if not public.est_admin_agence() and not exists(
  select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=auth.uid()) then
  return false;
 end if;
 if not exists(
  select 1 from public.rappels_dossiers r
   where r.dossier_id=d.id and r.nature='depot'
     and r.cree_le>coalesce(d.relances_depuis,'-infinity')
     and exists(select 1 from public.courriels_sortants c where c.rappel_id=r.id)
  having count(*)>=3 and d.activite_rappel_le<=max(r.cree_le)) then
  return false;
 end if;
 update public.dossiers set relances_depuis=clock_timestamp(),revision_rappel=gen_random_uuid()
  where id=d.id;
 insert into public.journal_acces(dossier_id,acteur,acteur_id,action)
 values(d.id,'agence',auth.uid(),'relances_reprises');
 return true;
end;
$$;
