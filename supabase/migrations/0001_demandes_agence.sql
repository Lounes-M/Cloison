-- Demandes d'acces des agences, depuis le formulaire de la page /agences.
--
-- C'est la premiere table du projet, et volontairement celle a plus faible
-- enjeu : elle sert a installer les gestes qui protegeront les tables
-- sensibles — migration versionnee, RLS des la creation, refus par defaut.
-- On apprend le geste sur ce qui ne fait pas mal.

create table public.demandes_agence (
  id uuid primary key default gen_random_uuid(),

  -- Donnees fournies par l'agence.
  nom_agence     text        not null check (char_length(trim(nom_agence)) between 2 and 120),
  email          text        not null check (char_length(email) between 5 and 180),
  ville          text        not null check (char_length(trim(ville)) between 2 and 80),
  dossiers_par_an text       not null check (dossiers_par_an in ('moins-de-10', '10-50', '50-200', 'plus-de-200')),
  message        text        null    check (message is null or char_length(message) <= 2000),

  -- Suivi commercial. `statut` evolue a la main pendant le pilote.
  statut         text        not null default 'nouvelle'
                 check (statut in ('nouvelle', 'contactee', 'qualifiee', 'perdue')),

  -- Contexte technique, utile pour distinguer un vrai lead d'un robot.
  source         text        null    check (source is null or char_length(source) <= 120),

  cree_le        timestamptz not null default now()
);

comment on table public.demandes_agence is
  'Demandes d''acces envoyees par les agences via /agences. Donnees professionnelles.';

-- Les deux lectures qu'on fera reellement : les plus recentes d'abord, et le
-- filtrage par statut pendant la prospection.
create index demandes_agence_cree_le_idx on public.demandes_agence (cree_le desc);
create index demandes_agence_statut_idx on public.demandes_agence (statut);

-- Un meme e-mail ne cree qu'une demande. Une agence qui clique deux fois ne
-- doit pas apparaitre deux fois dans la liste de prospection.
create unique index demandes_agence_email_idx on public.demandes_agence (lower(trim(email)));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Activee des la premiere table, et refus par defaut : sans politique
-- explicite, personne ne peut rien faire. On ouvre ensuite le strict
-- necessaire.
--
-- Ici, une seule ouverture : le role `anon` peut INSERER, rien d'autre. Pas de
-- SELECT, pas d'UPDATE, pas de DELETE. Consequence directe : meme si la cle
-- publiable fuitait, elle ne permettrait pas de LIRE la liste des agences
-- prospectees — seulement d'y ajouter du bruit, que l'anti-robot du formulaire
-- et la contrainte d'unicite limitent deja.
--
-- `anon` est bien le role vise : une requete portant une cle publiable
-- (`sb_publishable_...`) sans utilisateur connecte prend ce role, tout comme
-- l'ancienne cle `anon`.
--
-- La lecture se fait depuis le tableau de bord Supabase, avec ton compte.
-- Aucune cle de service n'existe dans l'application : le secret le plus
-- dangereux de Supabase n'entre jamais dans le depot.

alter table public.demandes_agence enable row level security;

create policy "Une agence peut deposer une demande"
  on public.demandes_agence
  for insert
  to anon
  with check (true);
