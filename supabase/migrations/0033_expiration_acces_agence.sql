-- La purge peut etre retardee. L'autorisation expire a l'echeance du dossier.
-- Politique restrictive : aucune politique permissive ne peut la contourner.
create policy "Echeance du dossier pour les agences"
  on public.dossiers as restrictive for all to authenticated
  using (expire_le > now())
  with check (expire_le > now());

-- Les politiques des engagements, pieces, cles, journaux et Storage relisent
-- dossiers sous le role appelant et heritent de cette restriction.
-- Cette fonction SECURITY DEFINER doit verifier l'echeance explicitement.
create or replace function public.journaliser(
  le_dossier uuid,
  l_action text,
  la_piece uuid default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  qui text;
  identite uuid;
  inscrit uuid;
begin
  if public.dossier_courant() is not null and le_dossier = public.dossier_courant() then
    qui := public.partie_courante();
    identite := null;
    if qui not in ('garant', 'locataire') then
      raise exception 'Jeton sans partie utilisable.' using errcode = 'insufficient_privilege';
    end if;
  elsif exists (
    select 1 from public.dossiers d
    where d.id = le_dossier and d.agence_id = public.agence_courante() and d.expire_le > now()
  ) then
    qui := 'agence';
    identite := auth.uid();
  else
    raise exception 'Aucun acces a ce dossier.' using errcode = 'insufficient_privilege';
  end if;
  if la_piece is not null and not exists (
    select 1 from public.pieces p where p.id = la_piece and p.dossier_id = le_dossier
  ) then
    raise exception 'Cette piece n appartient pas a ce dossier.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.journal_acces (dossier_id, piece_id, action, acteur, acteur_id)
    values (le_dossier, la_piece, l_action, qui, identite) returning id into inscrit;
  return inscrit;
end;
$$;
revoke all on function public.journaliser(uuid, text, uuid) from public;
grant execute on function public.journaliser(uuid, text, uuid) to authenticated, porteur_lien;
