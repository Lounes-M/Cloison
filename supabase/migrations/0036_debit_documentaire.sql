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
