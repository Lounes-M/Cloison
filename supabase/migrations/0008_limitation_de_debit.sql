-- Combien de fois, et en combien de temps.
--
-- La limite en memoire de `lib/agences/action.ts` ne borne qu'une instance
-- serverless a la fois : reparti sur plusieurs, un attaquant passe a cote.
-- L'ADR 0006 a rendu le sujet bloquant en introduisant le lien magique, qui
-- envoie un e-mail a une adresse choisie par l'appelant. C'est a la fois un
-- amplificateur de spam et un moyen de savoir si une adresse a un dossier.
--
-- Deux choix portent cette table.
--
-- 1. L'appelant ne choisit pas sa limite. Il dit ce qu'il fait, la fonction
--    sait combien c'est. Prendre le plafond en parametre reviendrait a laisser
--    demander l'infini.
--
-- 2. Ni adresse IP ni adresse e-mail n'arrivent jusqu'ici. Le serveur envoie
--    une empreinte HMAC calculee avec un secret qui vit chez Vercel. Le meme
--    partage que l'ADR 0003 : la donnee d'un cote, la cle de l'autre. Qui
--    obtiendrait cette table n'y lirait pas qui a essaye quoi.

create table public.debits (
  -- `sujet:empreinte`, fabrique par la fonction et jamais par l'appelant.
  cle text not null check (char_length(cle) between 16 and 200),

  -- Le debut du seau. Fenetres fixes plutot que glissantes : une fenetre
  -- glissante demande de garder chaque horodatage, donc de savoir quand
  -- quelqu'un a agi, ce qu'on cherche justement a ne pas conserver. Le prix est
  -- connu : a cheval sur deux seaux, on tolere jusqu'au double du plafond.
  fenetre timestamptz not null,

  compte integer not null default 1 check (compte > 0),

  primary key (cle, fenetre)
);

comment on table public.debits is
  'Compteurs de debit, par empreinte. Aucune adresse, aucun horodatage individuel.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- RLS active, et aucune politique : la table refuse tout a tout le monde. La
-- fonction plus bas est le seul chemin, comme pour `jetons_actifs`.

alter table public.debits enable row level security;

revoke all on public.debits from anon, authenticated, porteur_lien;

-- ---------------------------------------------------------------------------
-- Consommer une unite de debit
-- ---------------------------------------------------------------------------

create function public.consommer_debit(le_sujet text, l_empreinte text)
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

    -- Les deux points qui envoient un e-mail a une adresse choisie par
    -- l'appelant. Ce sont eux que l'ADR 0006 designe.
    when 'lien_locataire' then
      plafond := 3;  duree := interval '15 minutes';
    when 'lien_garant' then
      plafond := 3;  duree := interval '15 minutes';

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

comment on function public.consommer_debit(text, text) is
  'Consomme une unite et dit si elle passe. L appelant ne choisit pas son plafond.';

revoke all on function public.consommer_debit(text, text) from public;
grant execute on function public.consommer_debit(text, text)
  to anon, authenticated, porteur_lien;

-- Ce que cette table ne peut pas faire, et qu'il faut savoir : elle compte, elle
-- ne masque rien. Repondre la meme chose selon qu'une adresse a un dossier ou
-- non reste la charge du code appelant. Une limite qui repondrait « trop de
-- tentatives » seulement aux adresses connues serait un oracle.
