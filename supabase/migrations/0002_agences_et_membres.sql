-- Comptes d'agence : qui existe, qui appartient a qui, et qui a le droit d'agir.
--
-- Cette migration applique l'ADR 0002. Elle pose trois choses :
--
--   1. le role Postgres `porteur_lien`, troisieme frontiere d'acces, cree ici
--      alors qu'il ne donne encore acces a rien : comme la RLS de la table
--      `demandes_agence`, le geste s'installe avant que les tables sensibles
--      arrivent ;
--   2. les agences et leurs membres, avec le rattachement par domaine e-mail ;
--   3. la separation entre creer un compte (libre) et pouvoir envoyer un lien
--      a un vrai garant (verifie).
--
-- La regle qui gouverne tout le fichier : l'inscription est ouverte, c'est le
-- POUVOIR qui est controle. Une agence en statut `decouverte` a un compte
-- complet et ne peut collecter aucune piece.

-- ---------------------------------------------------------------------------
-- 1. Le troisieme role
-- ---------------------------------------------------------------------------
--
-- Trois populations, trois roles Postgres distincts :
--
--   anon           les formulaires publics             (deja en place)
--   authenticated  les collaborateurs d'agence         (Supabase Auth)
--   porteur_lien   le garant et le locataire           (jeton de capacite)
--
-- Distinguer les populations par le ROLE plutot que par un claim lu dans une
-- politique est la raison d'etre de ce decoupage : une politique ecrite
-- `to authenticated` est inatteignable par un porteur de lien, quelle que
-- soit l'erreur commise dans sa clause `using`. La frontiere ne depend pas
-- d'un `and` qu'on aurait pu oublier.
--
-- Aucun droit sur aucune table pour l'instant : les tables qu'il lira
-- (dossiers, pieces) n'existent pas encore. Il ne recoit ici que le droit de
-- traverser le schema.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'porteur_lien') then
    create role porteur_lien nologin noinherit;
  end if;
end
$$;

-- `authenticator` est le role par lequel PostgREST se connecte avant de
-- basculer vers celui que porte le jeton. Sans ce grant, un jeton
-- `role: porteur_lien` serait rejete a la connexion.
grant porteur_lien to authenticator;
grant usage on schema public to porteur_lien;

comment on role porteur_lien is
  'Garant et locataire, arrives par lien signe et sans compte. Aucun droit tant que les dossiers n''existent pas (phase 3).';

-- ---------------------------------------------------------------------------
-- 2. Domaines grand public
-- ---------------------------------------------------------------------------
--
-- Le rattachement par domaine est le moteur de croissance : le deuxieme
-- collaborateur d'une agence rejoint l'espace du premier au lieu d'en creer un
-- double. C'est aussi son unique mode de defaillance grave : si `gmail.com`
-- passait, tous les comptes Gmail du monde se retrouveraient dans une meme
-- agence, a se lire les uns les autres.
--
-- Le controle vit donc dans la base, pas seulement dans le formulaire. La
-- liste equivalente de `lib/agences/schema.ts` reste un confort d'interface :
-- elle refuse tot et poliment, elle ne protege rien.
--
-- C'est une table et non une constante pour qu'ajouter un fournisseur soit une
-- ligne, pas une migration.

create table public.domaines_grand_public (
  domaine text primary key check (domaine = lower(btrim(domaine)) and char_length(domaine) between 4 and 120)
);

comment on table public.domaines_grand_public is
  'Fournisseurs e-mail grand public. Ces domaines ne peuvent jamais rattacher ni creer une agence.';

insert into public.domaines_grand_public (domaine) values
  ('gmail.com'), ('googlemail.com'),
  ('yahoo.com'), ('yahoo.fr'),
  ('hotmail.com'), ('hotmail.fr'),
  ('outlook.com'), ('outlook.fr'),
  ('live.fr'), ('live.com'),
  ('free.fr'), ('orange.fr'), ('wanadoo.fr'), ('sfr.fr'), ('laposte.net'),
  ('icloud.com'), ('me.com'),
  ('protonmail.com'), ('proton.me'), ('gmx.fr'), ('aol.com');

alter table public.domaines_grand_public enable row level security;
-- Aucune politique : refus par defaut. Seules les fonctions `security definer`
-- ci-dessous la lisent, et elles le font avec les droits du proprietaire.

-- ---------------------------------------------------------------------------
-- 3. Les agences
-- ---------------------------------------------------------------------------

create table public.agences (
  id uuid primary key default gen_random_uuid(),

  nom     text not null check (char_length(btrim(nom)) between 2 and 120),

  -- Domaine e-mail professionnel. Unique : c'est lui qui decide du
  -- rattachement, deux agences ne peuvent pas se le disputer.
  domaine text not null unique
          check (domaine = lower(btrim(domaine)) and char_length(domaine) between 4 and 120),

  -- Ce que l'agence declare pour demander sa verification. Loi Hoguet : une
  -- agence qui fait de la gestion locative detient une carte professionnelle
  -- « Gestion immobiliere ». Le SIREN se controle par l'API Sirene ; la carte
  -- se declare et se verifie par sondage, faute de registre national ouvert.
  siren     text null check (siren is null or siren ~ '^[0-9]{9}$'),
  carte_pro text null check (carte_pro is null or char_length(btrim(carte_pro)) between 4 and 60),

  -- `decouverte` : compte complet, dossier de demonstration, aucune collecte
  --               de piece reelle possible.
  -- `verifiee`   : peut envoyer un lien a un vrai locataire.
  -- `suspendue`  : acces revoque, les donnees restent.
  statut text not null default 'decouverte'
         check (statut in ('decouverte', 'verifiee', 'suspendue')),
  verifiee_le timestamptz null,

  cree_le timestamptz not null default now(),

  -- La verification n'est pas un adjectif qu'on pose : sans les deux pieces et
  -- sa date, la base refuse la ligne. Le controle metier le plus important du
  -- produit ne depend donc pas de la discipline du code applicatif.
  constraint agence_verifiee_est_documentee check (
    statut <> 'verifiee'
    or (siren is not null and carte_pro is not null and verifiee_le is not null)
  )
);

comment on table public.agences is
  'Une agence = un domaine e-mail professionnel. Le statut decide du droit de collecter des pieces, pas du droit d''avoir un compte.';

create index agences_statut_idx on public.agences (statut);

-- Redeclarer son SIREN ou sa carte pro annule la verification : ce qui a ete
-- verifie, ce sont ces valeurs-la. Un trigger plutot qu'une regle applicative,
-- parce qu'une regle applicative s'oublie au deuxieme chemin d'ecriture.
create function public.agence_reinitialise_verification()
returns trigger
language plpgsql
as $$
begin
  if new.siren is distinct from old.siren or new.carte_pro is distinct from old.carte_pro then
    new.statut      := 'decouverte';
    new.verifiee_le := null;
  end if;
  return new;
end
$$;

create trigger agence_reinitialise_verification
  before update on public.agences
  for each row execute function public.agence_reinitialise_verification();

-- ---------------------------------------------------------------------------
-- 4. Les membres
-- ---------------------------------------------------------------------------
--
-- Un compte est une PERSONNE, jamais une agence. Un compte partage par huit
-- negociateurs rendrait creuse la promesse faite sur /agences : « chaque
-- consultation laisse une trace » : puisque la trace ne nommerait personne.
--
-- Deux roles, pas davantage. Une matrice de permissions se construit quand on
-- sait ce qu'elle doit exprimer, pas avant.

create table public.membres_agence (
  id uuid primary key default gen_random_uuid(),

  agence_id      uuid not null references public.agences(id)  on delete cascade,
  utilisateur_id uuid not null references auth.users(id)      on delete cascade,

  -- `admin`  : gere l'agence et ses membres.
  -- `membre` : cree et consulte les dossiers de l'agence.
  role text not null default 'membre' check (role in ('admin', 'membre')),

  cree_le timestamptz not null default now(),

  -- Une personne appartient a une seule agence. Un negociateur travaille pour
  -- une agence ; le cas du prestataire multi-agences attendra qu'il se
  -- presente reellement.
  unique (utilisateur_id)
);

comment on table public.membres_agence is
  'Rattachement d''une personne a une agence. Les membres voient tous les dossiers de leur agence : la gestion locative se fait a plusieurs, le cloisonnement se joue entre acteurs, pas entre collegues.';

create index membres_agence_agence_idx on public.membres_agence (agence_id);

-- ---------------------------------------------------------------------------
-- 5. Lecture du contexte, sans recursion
-- ---------------------------------------------------------------------------
--
-- Une politique sur `membres_agence` qui interrogerait `membres_agence`
-- boucle. Ces deux fonctions coupent la boucle : `security definer` les fait
-- tourner avec les droits du proprietaire des tables, qui n'est pas soumis a
-- leur RLS.
--
-- `search_path` est fige : sans cela, un schema place en tete par l'appelant
-- pourrait substituer ses propres tables a celles visees.

create function public.agence_courante()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select agence_id from public.membres_agence where utilisateur_id = auth.uid()
$$;

create function public.est_admin_agence()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.membres_agence
     where utilisateur_id = auth.uid() and role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- 6. Creer son compte, ou rejoindre celui de ses collegues
-- ---------------------------------------------------------------------------
--
-- Seul chemin d'entree. Il n'existe volontairement pas de table
-- d'invitations : le domaine EST l'invitation. Un collegue s'inscrit avec son
-- adresse professionnelle et rejoint l'agence, sans que personne ait a lui
-- preparer un jeton. Une invitation explicite ne deviendra necessaire que pour
-- quelqu'un dont l'adresse porte un autre domaine : l'administrateur d'un
-- reseau, en phase 4.
--
-- Les collaborateurs sont illimites et gratuits : le prix est a l'acte, chaque
-- siege supplementaire produit des dossiers, donc du revenu.

create function public.rejoindre_ou_creer_agence(nom_souhaite text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  courriel    text;
  -- Nommee `domaine_pro` et non `domaine` : une variable PL/pgSQL homonyme
  -- d'une colonne rend toute reference non qualifiee ambigue, et Postgres
  -- refuse alors la requete a l'execution.
  domaine_pro text;
  cible       uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  -- Idempotent : reappele apres coup, il rend l'agence deja rattachee plutot
  -- que d'echouer. Un double clic sur « terminer l'inscription » n'est pas une
  -- erreur.
  select agence_id into cible from public.membres_agence where utilisateur_id = auth.uid();
  if found then
    return cible;
  end if;

  -- L'adresse doit etre confirmee : tout le rattachement par domaine repose
  -- sur elle. Une adresse non confirmee laisserait entrer dans l'agence d'un
  -- tiers en se declarant simplement `quelqu-un@son-domaine.fr`.
  select email into courriel
    from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if not found then
    raise exception 'Adresse e-mail non confirmee.' using errcode = '42501';
  end if;

  domaine_pro := lower(btrim(split_part(courriel, '@', 2)));

  if exists (select 1 from public.domaines_grand_public d where d.domaine = domaine_pro) then
    raise exception 'Une adresse professionnelle est requise.' using errcode = '42501';
  end if;

  select id into cible from public.agences a where a.domaine = domaine_pro;

  if found then
    -- Rattachement : l'agence existe deja, on rejoint comme membre simple.
    insert into public.membres_agence (agence_id, utilisateur_id, role)
      values (cible, auth.uid(), 'membre');
  else
    -- Creation : le premier arrive administre. Le nom est alors obligatoire.
    if nom_souhaite is null or char_length(btrim(nom_souhaite)) < 2 then
      raise exception 'Le nom de l''agence est requis.' using errcode = '22023';
    end if;

    insert into public.agences (nom, domaine)
      values (btrim(nom_souhaite), domaine_pro)
      returning id into cible;

    insert into public.membres_agence (agence_id, utilisateur_id, role)
      values (cible, auth.uid(), 'admin');
  end if;

  return cible;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Droits et politiques
-- ---------------------------------------------------------------------------
--
-- On retire d'abord tout, on rouvre ensuite le strict necessaire : les droits
-- par defaut de Supabase sur le schema `public` sont larges, et une table
-- sensible ne doit rien devoir a un defaut.

revoke all on public.agences               from anon, authenticated, porteur_lien;
revoke all on public.membres_agence        from anon, authenticated, porteur_lien;
revoke all on public.domaines_grand_public from anon, authenticated, porteur_lien;

revoke all on function public.rejoindre_ou_creer_agence(text) from public;
grant execute on function public.rejoindre_ou_creer_agence(text) to authenticated;

alter table public.agences        enable row level security;
alter table public.membres_agence enable row level security;

-- --- agences ---------------------------------------------------------------

grant select on public.agences to authenticated;

-- Droits par COLONNE, et c'est ici que se tient la garantie du modele : la RLS
-- ne sait pas restreindre une colonne. Sans ce grant nominatif, un
-- administrateur d'agence pourrait s'attribuer `statut = 'verifiee'` et
-- collecter des pieces reelles sans avoir rien justifie.
--
-- `statut` et `verifiee_le` ne sont donc accessibles a personne via l'API :
-- ils se changent depuis le tableau de bord Supabase, a la main pendant le
-- pilote, avec ton compte.
grant update (nom, siren, carte_pro) on public.agences to authenticated;

create policy "Un membre voit son agence"
  on public.agences
  for select
  to authenticated
  using (id = public.agence_courante());

create policy "Un admin decrit son agence"
  on public.agences
  for update
  to authenticated
  using (id = public.agence_courante() and public.est_admin_agence() and statut <> 'suspendue')
  with check (id = public.agence_courante());

-- Pas de politique d'insertion : une agence ne nait que par
-- `rejoindre_ou_creer_agence`, qui verifie le domaine. Pas de politique de
-- suppression : une agence supprimee emporterait ses dossiers.

-- --- membres_agence --------------------------------------------------------

grant select, delete on public.membres_agence to authenticated;
grant update (role)  on public.membres_agence to authenticated;

create policy "Un membre voit ses collegues"
  on public.membres_agence
  for select
  to authenticated
  using (agence_id = public.agence_courante());

create policy "Un admin change le role d'un collegue"
  on public.membres_agence
  for update
  to authenticated
  using (agence_id = public.agence_courante() and public.est_admin_agence())
  with check (agence_id = public.agence_courante());

create policy "Un admin retire un collegue"
  on public.membres_agence
  for delete
  to authenticated
  using (
    agence_id = public.agence_courante()
    and public.est_admin_agence()
    and utilisateur_id <> auth.uid()
  );

-- Pas de politique d'insertion : on ne rejoint une agence que par le domaine,
-- via `rejoindre_ou_creer_agence`. Un administrateur ne peut donc pas ajouter
-- une adresse exterieure a son domaine, ce qui serait le moyen le plus simple
-- de contourner la verification.
--
-- Limite connue, a tenir cote interface en phase 3 : rien n'empeche le dernier
-- administrateur de se retrograder et de laisser l'agence sans admin. La
-- contrainte se formule mal en SQL sans serialiser toutes les ecritures ; elle
-- coute une agence bloquee et un appel au support, pas une fuite.
