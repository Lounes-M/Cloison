-- Decrire le bien sur la page du lien de candidature.
--
-- La page d'un lien de candidature (0070) ne montrait que le libelle et le
-- loyer. L'agence peut desormais y ajouter la ville, la surface, le nombre
-- de pieces, l'ameublement et la date de disponibilite. Ce sont des faits sur
-- le bien, jamais sur un candidat ni sur le proprietaire ; chacun est
-- facultatif et borne.

alter table public.logements
  add column ville text null check (length(btrim(ville)) between 1 and 80),
  add column surface_m2 integer null check (surface_m2 between 5 and 1000),
  add column pieces smallint null check (pieces between 1 and 20),
  add column meuble boolean null,
  add column disponible_le date null;

grant insert (ville, surface_m2, pieces, meuble, disponible_le) on public.logements to authenticated;
grant update (ville, surface_m2, pieces, meuble, disponible_le) on public.logements to authenticated;

-- Le type de retour change : la fonction est recreee, avec les memes droits.
drop function public.logement_par_code(text);
create function public.logement_par_code(le_code text)
returns table(libelle text, loyer_cents bigint, agence text, ville text, surface_m2 integer,
              pieces smallint, meuble boolean, disponible_le date)
language sql stable security definer set search_path='' as $$
  select l.libelle, l.loyer_cents, a.nom, l.ville, l.surface_m2, l.pieces, l.meuble, l.disponible_le
    from public.logements l
    join public.agences a on a.id = l.agence_id
   where le_code ~ '^[a-f0-9]{32}$'
     and l.code_candidature = le_code
     and not l.archive
     and a.statut = 'verifiee';
$$;
revoke all on function public.logement_par_code(text)
 from public,anon,authenticated,porteur_lien,depot_piece,archive_signature,service_role;
grant execute on function public.logement_par_code(text) to serveur;
