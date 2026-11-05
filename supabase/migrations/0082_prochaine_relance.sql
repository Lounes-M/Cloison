-- Dire a l'agence quand partira la prochaine relance automatique du garant.
--
-- La fiche disait combien de relances etaient parties (0076), pas si une
-- autre allait suivre ni quand. Cette fonction applique les memes conditions
-- que `programmer_rappels` (0052, 0078, 0079) pour une relance de depot et
-- rend la date a partir de laquelle elle peut partir : delai de relance de
-- l'agence apres la derniere activite, trois jours au moins apres la
-- relance precedente, avant l'echeance du dossier. `actives` dit si l'agence
-- a active les relances. Rien sur le destinataire ni le contenu.

create function public.prochaine_relance_garant(le_dossier uuid)
returns table(actives boolean, prochaine timestamptz)
language sql stable security definer set search_path='' as $$
 with d as (
  select d.*, coalesce(g.relance_jours, 0) relance_jours, a.statut agence_statut
    from public.dossiers d
    join public.agences a on a.id = d.agence_id
    left join public.reglages_rappels g on g.agence_id = a.id
   where d.id = le_dossier and d.agence_id = public.agence_courante()
     and d.expire_le > clock_timestamp() and d.statut <> 'expire'
 ), date_prevue as (
  select d.*,
   greatest(
    d.activite_rappel_le + make_interval(days => d.relance_jours),
    coalesce((select max(r.cree_le) from public.rappels_dossiers r
               where r.dossier_id = d.id and r.nature = 'depot'), '-infinity') + interval '3 days',
    clock_timestamp()
   ) quand
  from d
 )
 select p.relance_jours > 0,
  case when p.relance_jours > 0 and p.agence_statut = 'verifiee' and not p.demonstration
   and p.email_garant is not null
   and (p.statut in ('ouvert','depot_en_cours') or (p.statut in ('complet','garant_insuffisant')
     and exists(select 1 from public.complements_documentaires c where c.dossier_id = p.id and c.etat = 'demande')))
   and (select count(*) from public.rappels_dossiers r where r.dossier_id = p.id and r.nature = 'depot'
     and r.cree_le > coalesce(p.relances_depuis, '-infinity')) < 3
   and p.quand < p.expire_le
  then p.quand end
 from date_prevue p;
$$;
revoke all on function public.prochaine_relance_garant(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.prochaine_relance_garant(uuid) to authenticated;
notify pgrst,'reload schema';
