-- La liste des logements dit lesquels ont un lien de candidature ouvert.
--
-- Comme en 0069, avec une colonne de plus : un booleen, jamais le code, qui
-- reste lisible sur la fiche du logement seulement. Le type de retour change,
-- la fonction est donc recreee avec les memes droits.

drop function public.logements_de_mon_agence(boolean);
create function public.logements_de_mon_agence(avec_archives boolean default false)
returns table(id uuid, libelle text, loyer_cents bigint, archive boolean, cree_le timestamptz,
  candidats integer, complets integer, pris integer, candidature_ouverte boolean)
language sql stable security definer set search_path='' as $$
  select l.id, l.libelle, l.loyer_cents, l.archive, l.cree_le,
    count(d.id)::int,
    count(d.id) filter (where d.statut = 'complet')::int,
    count(d.id) filter (where d.statut in ('transmis', 'signe'))::int,
    l.code_candidature is not null
    from public.logements l
    left join public.dossiers d on d.logement_id = l.id and d.expire_le > now()
     and not d.demonstration
   where l.agence_id = public.agence_courante() and (avec_archives or not l.archive)
   group by l.id
   order by l.archive, l.cree_le desc
   limit 200;
$$;
revoke all on function public.logements_de_mon_agence(boolean)
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.logements_de_mon_agence(boolean) to authenticated;
