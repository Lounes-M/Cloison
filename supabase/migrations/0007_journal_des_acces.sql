-- Qui a ouvert quoi, et quand.
--
-- Le produit promet un coffre. Un coffre dont personne ne peut dire qui l'a
-- ouvert est une armoire. Ce journal est donc une piece du produit et non de
-- l'exploitation : le garant y lit qui a consulte son bulletin de paie, ce
-- qu'aucune des solutions existantes ne lui montre.
--
-- Deux proprietes le tiennent, et elles se defendent separement.
--
-- 1. On n'ecrit ici que sur soi. Personne n'insere directement : une fonction
--    `security definer` renseigne l'acteur d'apres le jeton de l'appelant, ce
--    qui rend une entree mensongere impossible a fabriquer plutot
--    qu'improbable.
--
-- 2. Ce qui est ecrit ne se reecrit pas. Aucun droit d'`update` ni de
--    `delete`, et un declencheur qui refuse quand meme : il faudrait donc deux
--    fautes, un `grant` et une politique, pour ouvrir une breche, la seconde
--    servant a rattraper la premiere.

-- ---------------------------------------------------------------------------
-- 1. La table
-- ---------------------------------------------------------------------------

create table public.journal_acces (
  id uuid primary key default gen_random_uuid(),

  dossier_id uuid not null references public.dossiers (id) on delete cascade,

  -- Sans cle etrangere, volontairement. Une entree qui dit « cette piece a ete
  -- ouverte » doit survivre au retrait de la piece, sinon le journal
  -- s'effacerait au moment ou il servirait. Une cle etrangere ferait pire
  -- encore : `on delete cascade` supprimerait la trace, et `on delete set
  -- null` declencherait une mise a jour, que le declencheur plus bas refuse.
  -- L'appartenance au dossier est verifiee a l'ecriture, une fois.
  piece_id uuid,

  action text not null
         check (action in ('dossier_consulte', 'piece_deposee', 'piece_retiree',
                           'piece_ouverte', 'dossier_transmis')),

  -- De quel cote de la cloison se tenait l'auteur du geste.
  acteur text not null check (acteur in ('agence', 'garant', 'locataire')),

  -- Renseigne pour une agence, ou l'on sait qui precisement. Nul pour un
  -- porteur de lien : il n'a pas de compte, et lui en inventer un serait
  -- inscrire une identite qu'on n'a pas verifiee.
  acteur_id uuid references auth.users (id),

  quand timestamptz not null default now(),

  constraint identite_seulement_pour_une_agence
    check ((acteur = 'agence') or (acteur_id is null))
);

comment on table public.journal_acces is
  'Qui a ouvert quoi, et quand. En ecriture seule, et jamais sur le compte d un autre.';

create index journal_acces_dossier_idx on public.journal_acces (dossier_id, quand desc);

-- ---------------------------------------------------------------------------
-- 2. Ce qui est ecrit ne se reecrit pas
-- ---------------------------------------------------------------------------
--
-- Le declencheur ne barre que les trois roles de l'application. Le
-- proprietaire garde la main, et il le faut : la suppression d'un dossier
-- emporte son journal par cascade, et c'est la bonne facon d'oublier. Barrer
-- tout le monde rendrait un dossier indestructible, donc ineffacable, ce qui
-- serait une faute d'un autre genre.
--
-- Pas de `security definer` ici : le declencheur doit voir le role de
-- l'appelant, pas le sien.

create function public.journal_est_en_ecriture_seule()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated', 'porteur_lien') then
    raise exception 'Le journal des acces ne se modifie pas.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger journal_sans_reecriture
  before update or delete on public.journal_acces
  for each row
  execute function public.journal_est_en_ecriture_seule();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.journal_acces enable row level security;

revoke all on public.journal_acces from anon, authenticated, porteur_lien;

-- Lecture seule, et pour personne d'autre. Aucun `insert` : le seul chemin
-- d'ecriture est `journaliser()`.
grant select on public.journal_acces to authenticated, porteur_lien;

create policy "Une agence lit le journal de ses dossiers"
  on public.journal_acces for select to authenticated
  using (dossier_id in (select id from public.dossiers where agence_id = public.agence_courante()));

-- La transparence que le produit vend. Le garant a depose ; il voit qui a
-- regarde.
create policy "Le garant lit le journal de son dossier"
  on public.journal_acces for select to porteur_lien
  using (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

-- Le locataire n'a aucune politique ici, comme sur `pieces` et sur
-- `cles_dossier`. Lui montrer qu'une piece a ete ouverte lui apprendrait
-- qu'elle existe, et la cloison tomberait par la bande.

-- ---------------------------------------------------------------------------
-- 4. Le seul chemin d'ecriture
-- ---------------------------------------------------------------------------
--
-- L'appelant ne choisit ni qui il est ni quand c'etait : il dit ce qu'il fait,
-- sur quel dossier, et la fonction renseigne le reste d'apres son jeton. C'est
-- la meme raison que pour `ouvrir_dossier` : accorder l'`insert` laisserait
-- ecrire n'importe quel acteur sous n'importe quelle date.

create function public.journaliser(
  le_dossier uuid,
  l_action   text,
  la_piece   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  qui      text;
  identite uuid;
  inscrit  uuid;
begin
  -- Un porteur de lien d'abord : son jeton designe un dossier et un seul.
  if public.dossier_courant() is not null and le_dossier = public.dossier_courant() then
    qui := public.partie_courante();
    identite := null;

    if qui not in ('garant', 'locataire') then
      raise exception 'Jeton sans partie utilisable.' using errcode = 'insufficient_privilege';
    end if;

  -- Une agence ensuite, sur un dossier qui lui est rattache.
  elsif exists (
    select 1 from public.dossiers d
     where d.id = le_dossier and d.agence_id = public.agence_courante()
  ) then
    qui := 'agence';
    identite := auth.uid();

  else
    -- Sans quoi n'importe qui inscrirait des lignes dans le journal de
    -- n'importe quel dossier, ce qui le rendrait inutilisable comme preuve.
    raise exception 'Aucun acces a ce dossier.' using errcode = 'insufficient_privilege';
  end if;

  -- Verifie une fois, a l'ecriture, ce que l'absence de cle etrangere ne
  -- verifiera plus jamais ensuite.
  if la_piece is not null and not exists (
    select 1 from public.pieces p where p.id = la_piece and p.dossier_id = le_dossier
  ) then
    raise exception 'Cette piece n appartient pas a ce dossier.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.journal_acces (dossier_id, piece_id, action, acteur, acteur_id)
  values (le_dossier, la_piece, l_action, qui, identite)
  returning id into inscrit;

  return inscrit;
end;
$$;

comment on function public.journaliser(uuid, text, uuid) is
  'Inscrit un acces. L appelant dit ce qu il fait, jamais qui il est.';

revoke all on function public.journaliser(uuid, text, uuid) from public;
grant execute on function public.journaliser(uuid, text, uuid) to authenticated, porteur_lien;

-- L'emission d'un lien n'est pas journalisee ici, et ce n'est pas un oubli :
-- elle se fait avant toute session, donc en `anon`, et `jetons_actifs` porte
-- deja le jeton courant de chaque partie. Ouvrir cette fonction a `anon`
-- offrirait a un inconnu de quoi remplir le journal d'un dossier dont il
-- connaitrait l'identifiant.
