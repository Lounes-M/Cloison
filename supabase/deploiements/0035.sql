begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"2af559e16c588ff71ce8aab13e376f2f0ef91ac6634e7b3b4bdd755bd7044205","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"3173387dce723393fdf217155b9ca5ea436d8aa3f3151bd7e608389e0ec3fa6f","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"f527f63fa42aff373bd9b4eb629a74f8aaa4db0412f680eba75452ace8e79af2","declencheurs":"4dbadd486a83e0db7f7d0f124cc2a529afbd10b7cc9fb208e4ab132377885364"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
-- Les retraits d'administrateurs d'une agence sont serialises sur son parent.
create function public.conserver_administrateur()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'admin' and (
    tg_op = 'DELETE' or new.role <> 'admin' or new.agence_id is distinct from old.agence_id
  ) then
    -- Une ecriture identique force aussi un conflit de versions en isolation
    -- Repeatable Read, ou un simple verrou laisserait subsister un vieux compte.
    update public.agences set nom = nom where id = old.agence_id;
    -- La suppression administrative du parent peut poursuivre sa cascade.
    if found and not exists (
      select 1 from public.membres_agence
      where agence_id = old.agence_id and role = 'admin'
        and utilisateur_id <> old.utilisateur_id
    ) then
      raise exception 'Le dernier administrateur doit designer son successeur.'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.conserver_administrateur()
  from public, anon, authenticated, porteur_lien, serveur, depot_piece;

create trigger membre_conserve_administrateur
  before update or delete on public.membres_agence
  for each row execute function public.conserver_administrateur();

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"2af559e16c588ff71ce8aab13e376f2f0ef91ac6634e7b3b4bdd755bd7044205","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"8235a885b4d70e90a56745e4ed25db36cf5cd00575178be47622532242098a50","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"f527f63fa42aff373bd9b4eb629a74f8aaa4db0412f680eba75452ace8e79af2","declencheurs":"b8a6a3e6651b15f00228517666dc30fa4ce778dc034eb2efd063407dc4e4188e"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
