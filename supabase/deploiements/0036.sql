begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"2af559e16c588ff71ce8aab13e376f2f0ef91ac6634e7b3b4bdd755bd7044205","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"8235a885b4d70e90a56745e4ed25db36cf5cd00575178be47622532242098a50","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"f527f63fa42aff373bd9b4eb629a74f8aaa4db0412f680eba75452ace8e79af2","declencheurs":"b8a6a3e6651b15f00228517666dc30fa4ce778dc034eb2efd063407dc4e4188e"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
-- Compteurs partages avant toute analyse ou rasterisation documentaire.
create or replace function public.consommer_debit(le_sujet text, l_empreinte text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plafond  integer;
  duree    interval;
  la_cle   text;
  debut    timestamptz;
  atteint  integer;
begin
  -- Les plafonds vivent ici, hors de portee de l'appelant.
  case le_sujet
    when 'depot_dossier' then plafond := 20; duree := interval '15 minutes';
    when 'depot_ip' then plafond := 60; duree := interval '15 minutes';
    when 'depot_global' then plafond := 300; duree := interval '15 minutes';
    -- Le formulaire agence : du bruit ordinaire, rien de sensible derriere.
    when 'demande_agence' then
      plafond := 5;  duree := interval '10 minutes';

    -- Les points qui envoient un e-mail a une adresse choisie par l'appelant.
    when 'lien_locataire' then
      plafond := 3;  duree := interval '15 minutes';
    when 'lien_garant' then
      plafond := 3;  duree := interval '15 minutes';

    -- La connexion agence en fait partie, avec un plafond un peu plus large :
    -- un bureau derriere une seule adresse IP publique compte pour un, et
    -- plusieurs collaborateurs peuvent se connecter dans la meme heure.
    when 'connexion_agence' then
      plafond := 10; duree := interval '15 minutes';

    -- `ouvrir_dossier` est accessible en `anon` par construction : le locataire
    -- arrive avant d'avoir un jeton. Sans limite, on remplit la table.
    when 'ouverture_dossier' then
      plafond := 10; duree := interval '1 hour';

    else
      raise exception 'Sujet de limitation inconnu : %', le_sujet
        using errcode = 'check_violation';
  end case;

  -- Une empreinte, pas une adresse. Le refus est net : une valeur qui n'a pas
  -- cette forme signale un appelant qui a saute le calcul, donc une limite qui
  -- ne limiterait rien.
  if l_empreinte is null or l_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte attendue en sha256 hexadecimal.'
      using errcode = 'check_violation';
  end if;

  la_cle := le_sujet || ':' || l_empreinte;
  debut  := date_bin(duree, now(), timestamptz 'epoch');

  -- Les seaux passes de cette cle ne servent plus a rien. Les effacer ici borne
  -- la table a une ligne par cle vivante, sans tache de fond a surveiller.
  delete from public.debits d where d.cle = la_cle and d.fenetre < debut;

  insert into public.debits (cle, fenetre, compte)
  values (la_cle, debut, 1)
  on conflict (cle, fenetre) do update set compte = debits.compte + 1
  returning compte into atteint;

  return atteint <= plafond;
end;
$$;

revoke all on function public.consommer_debit(text,text) from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.consommer_debit(text,text) to serveur;

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"2af559e16c588ff71ce8aab13e376f2f0ef91ac6634e7b3b4bdd755bd7044205","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"2722a1e4e0a184e56913428da5fc6293cb3f47d68faa16ac23aca3fb954e8a53","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"f527f63fa42aff373bd9b4eb629a74f8aaa4db0412f680eba75452ace8e79af2","declencheurs":"b8a6a3e6651b15f00228517666dc30fa4ce778dc034eb2efd063407dc4e4188e"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
