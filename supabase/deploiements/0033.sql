begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"e7ed7a0d66379268e60b2408c2386fbc2f033bbc87363c4964c543858ec7de22","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"bb5c2c495a58c04f4fb88f4c11e4becd554667703125e912c12b31aae6c9dfa7","politiques":"e3578b8b3051bcdc87f77edfb1cd2e832c35b99f41ce14d5bd2833d88d0cb6b6","contraintes":"c4e3786263864511d4ba958e7617a0ad01ced3155e67d5f69c693d13d7619d9f","declencheurs":"a8c45a29b0aa370e312675b60fa44de854de2150336e9705d498baa04dcfd9cb"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"e7ed7a0d66379268e60b2408c2386fbc2f033bbc87363c4964c543858ec7de22","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"14bdc68ec0fa78c38350cc8886b50f107ec09c63e0220b4f5453c8663c963fc3","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"c4e3786263864511d4ba958e7617a0ad01ced3155e67d5f69c693d13d7619d9f","declencheurs":"a8c45a29b0aa370e312675b60fa44de854de2150336e9705d498baa04dcfd9cb"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
