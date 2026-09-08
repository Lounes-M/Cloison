begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"e7ed7a0d66379268e60b2408c2386fbc2f033bbc87363c4964c543858ec7de22","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"14bdc68ec0fa78c38350cc8886b50f107ec09c63e0220b4f5453c8663c963fc3","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"c4e3786263864511d4ba958e7617a0ad01ced3155e67d5f69c693d13d7619d9f","declencheurs":"a8c45a29b0aa370e312675b60fa44de854de2150336e9705d498baa04dcfd9cb"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
-- Une mention appartient aux conditions que le garant a vues.
alter table public.engagements
  add column version_conditions integer not null default 1
  check (version_conditions > 0);

create function public.versionner_conditions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- Le grant INSERT historique porte sur la table entiere.
    new.version_conditions := 1;
  elsif row(new.couvre, new.montant_max_cents, new.jusqu_au, new.solidaire)
        is distinct from row(old.couvre, old.montant_max_cents, old.jusqu_au, old.solidaire) then
    new.version_conditions := old.version_conditions + 1;
    new.mention := null;
    new.mention_saisie_le := null;
  else
    new.version_conditions := old.version_conditions;
  end if;
  return new;
end;
$$;
revoke all on function public.versionner_conditions()
  from public, anon, authenticated, porteur_lien, serveur, depot_piece;

create trigger engagement_conditions_versionnees
  before insert or update on public.engagements
  for each row execute function public.versionner_conditions();

comment on column public.engagements.version_conditions is
  'Version des conditions financieres et de solidarite ; invalide la mention lors d un changement.';

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"2af559e16c588ff71ce8aab13e376f2f0ef91ac6634e7b3b4bdd755bd7044205","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"3173387dce723393fdf217155b9ca5ea436d8aa3f3151bd7e608389e0ec3fa6f","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"f527f63fa42aff373bd9b4eb629a74f8aaa4db0412f680eba75452ace8e79af2","declencheurs":"4dbadd486a83e0db7f7d0f124cc2a529afbd10b7cc9fb208e4ab132377885364"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
