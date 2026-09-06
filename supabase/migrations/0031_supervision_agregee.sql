-- Lecture agregee pour l exploitation, sans identifiants ni donnees de dossier.
create index journal_acces_supervision_idx on public.journal_acces(quand)
  where acteur='agence' and action='piece_ouverte';

create function public.rapport_exploitation()
returns jsonb language sql stable security definer set search_path='' as $$
with acces_recents as (
  select j.acteur_id,j.dossier_id from public.journal_acces j
  join public.dossiers d on d.id=j.dossier_id
  where j.acteur='agence' and j.action='piece_ouverte' and not d.demonstration
    and j.quand >= now()-interval '1 hour' and j.quand <= now()
), cohortes as (
  select d.id,d.agence_id,(d.email_garant is not null) as garant_designe,d.statut
  from public.dossiers d where not d.demonstration
    and d.cree_le >= now()-interval '28 days' and d.cree_le <= now()
)
select jsonb_build_object(
  'version',1,
  'alertes',jsonb_build_object(
    'collaborateurs_acces_intensifs',(select count(*) from (select acteur_id from acces_recents where acteur_id is not null group by acteur_id having count(*) >= 100) x),
    'dossiers_acces_intensifs',(select count(*) from (select dossier_id from acces_recents group by dossier_id having count(*) >= 50) x),
    'purges_en_retard',(select count(*) from public.objets_a_supprimer where cree_le <= now()-interval '1 hour'),
    'courriels_a_reconcilier',(select count(*) from public.courriels_sortants where envoye_le is null and (a_reconcilier or premier_essai <= now()-interval '23 hours'))
  ),
  'pilote',jsonb_build_object(
    'jours',28,
    'dossiers_presents',(select count(*) from cohortes),
    'avec_agence',(select count(*) from cohortes where agence_id is not null),
    'garant_designe',(select count(*) from cohortes where garant_designe),
    'avec_piece_presente',(select count(*) from cohortes c where exists(select 1 from public.pieces p where p.dossier_id=c.id)),
    'complets_ou_transmis',(select count(*) from cohortes where statut in ('complet','transmis','signe')),
    'marques_signes',(select count(*) from cohortes where statut='signe')
  )
);
$$;
revoke all on function public.rapport_exploitation() from public,anon,authenticated,porteur_lien;
grant execute on function public.rapport_exploitation() to serveur;
