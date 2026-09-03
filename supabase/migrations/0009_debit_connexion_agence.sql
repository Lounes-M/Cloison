-- Un sujet de plus a limiter : la connexion d'un collaborateur d'agence.
--
-- La 0008 avait pose les quatre sujets connus a ce moment-la. L'authentification
-- de l'agence en ajoute un cinquieme, et de la meme famille que les deux liens
-- magiques : un point qui envoie un e-mail a une adresse choisie par
-- l'appelant, donc un amplificateur si rien ne le borne.
--
-- Supabase Auth limite deja les envois par adresse et globalement par heure. Ce
-- compteur-ci borne par empreinte d'adresse IP, ce que Supabase ne voit pas :
-- quelqu'un qui ferait tourner mille adresses differentes passerait sous les
-- limites de Supabase sans jamais toucher les notres.
--
-- `create or replace` plutot qu'une nouvelle fonction : les droits accordes par
-- la 0008 survivent au remplacement, et l'appelant ne change pas.

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
  if l_empreinte !~ '^[0-9a-f]{64}$' then
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
