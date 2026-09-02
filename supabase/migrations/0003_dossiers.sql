-- Le dossier de caution, et le cloisonnement qui fait le produit.
--
-- C'est la migration ou la matrice qui-voit-quoi devient du SQL. Trois tables
-- plutot qu'une, et le decoupage n'est pas esthetique :
--
--   dossiers      ce que le locataire, le garant et l'agence peuvent tous voir
--   engagements   ce que couvre le garant, et combien : jamais le locataire
--   pieces        les documents deposes : jamais le locataire
--
-- On aurait pu tout mettre dans `dossiers` et proteger les montants par des
-- droits de colonne. Une table par regle vaut mieux : chaque politique tient
-- alors en une phrase verifiable, la ou un `grant` trop large sur une table
-- unique reouvrirait tout sans bruit.
--
-- Nuance importante, et elle contraint tout le reste : `porteur_lien` est un
-- SEUL role Postgres pour le garant ET le locataire (ADR 0002). La frontiere
-- entre eux ne peut donc pas venir des droits de table, elle vient du claim
-- `role_partie` porte par le jeton de capacite et lu dans les politiques.

-- ---------------------------------------------------------------------------
-- 1. Lire le jeton de capacite
-- ---------------------------------------------------------------------------
--
-- Le pendant de `auth.uid()` pour le garant et le locataire, qui n'ont pas de
-- compte. Ces deux fonctions definissent le contrat que le jeton devra
-- remplir : la PR qui les emet n'a plus qu'a poser ces deux claims.
--
-- `stable` et non `immutable` : la valeur change d'une requete a l'autre.

create function public.dossier_courant()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.dossier_id', true), '')::uuid
$$;

comment on function public.dossier_courant() is
  'Le dossier que le jeton de capacite autorise. Null pour toute autre population.';

create function public.partie_courante()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role_partie', true), '')
$$;

comment on function public.partie_courante() is
  'Le role porte par le jeton : locataire ou garant. C''est la seule chose qui les distingue.';

-- ---------------------------------------------------------------------------
-- 2. Le dossier
-- ---------------------------------------------------------------------------

create table public.dossiers (
  id uuid primary key default gen_random_uuid(),

  -- L'identifiant court montre dans le lien. Aleatoire et non devinable : il
  -- ne remplace pas le jeton, mais un identifiant sequentiel donnerait le
  -- volume d'affaires et permettrait d'enumerer.
  reference text not null unique
            default encode(gen_random_bytes(9), 'base64')
            check (char_length(reference) between 8 and 32),

  -- Nul tant que le dossier n'est pas rattache : le locataire peut ouvrir un
  -- dossier sans agence, et la rattacher ensuite.
  agence_id uuid null references public.agences (id) on delete set null,

  -- Les adresses vivent sur le dossier et meurent avec lui (ADR 0006). Il n'y
  -- a pas de table d'utilisateurs pour ces deux-la, donc rien ne se cumule
  -- d'un dossier a l'autre.
  email_locataire text not null check (char_length(email_locataire) between 5 and 180),
  email_garant    text null     check (email_garant is null
                                       or char_length(email_garant) between 5 and 180),

  -- Le statut est la seule chose que le locataire apprend de l'avancement.
  -- Aucune valeur ne laisse deduire un montant : `garant_insuffisant` dit que
  -- le dossier n'ira pas plus loin, pas pourquoi. Le detail vit dans
  -- `engagements`, que le locataire ne lit jamais.
  statut text not null default 'ouvert'
         check (statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant',
                           'transmis', 'signe', 'refuse', 'expire')),

  cree_le   timestamptz not null default now(),

  -- Trente jours tant que rien n'est depose, trois mois ensuite (voir le
  -- declencheur plus bas). L'ADR 0003 rappelle que trois mois est un plafond
  -- et non un delai a consommer : un dossier ou le garant n'a rien depose ne
  -- contient qu'une adresse, autant l'effacer tot.
  expire_le timestamptz not null default now() + interval '30 days'
            check (expire_le > cree_le)
);

comment on table public.dossiers is
  'Un dossier de caution. Porte les adresses des deux parties, et rien d''autre les concernant.';

create index dossiers_agence_idx on public.dossiers (agence_id);
create index dossiers_expire_idx on public.dossiers (expire_le);

-- ---------------------------------------------------------------------------
-- 3. Ce que le garant couvre
-- ---------------------------------------------------------------------------

create table public.engagements (
  dossier_id uuid primary key references public.dossiers (id) on delete cascade,

  couvre text not null default 'loyer_charges'
         check (couvre in ('loyer', 'loyer_charges')),

  -- En centimes : un montant d'engagement ne se stocke pas en flottant.
  montant_max_cents bigint null check (montant_max_cents is null or montant_max_cents > 0),

  jusqu_au date null,

  -- Determine ce que la mention devra contenir (ADR 0005) : la renonciation
  -- aux benefices de discussion et de division n'est exigee que si
  -- l'engagement est solidaire.
  solidaire boolean not null default true,

  -- Rempli au calcul, jamais saisi. Nul tant que les pieces ne suffisent pas.
  ratio      numeric(5, 2) null check (ratio is null or ratio >= 0),
  calcule_le timestamptz null,

  constraint ratio_et_sa_date check ((ratio is null) = (calcule_le is null))
);

comment on table public.engagements is
  'Ce que le garant couvre, et le ratio calcule. Le locataire n''y a jamais acces.';

-- ---------------------------------------------------------------------------
-- 4. Les pieces
-- ---------------------------------------------------------------------------
--
-- Les metadonnees seulement. Le contenu part chiffre vers Storage, et les
-- colonnes de chiffrement arriveront avec la PR qui l'implemente : les poser
-- ici, inutilisees, serait du schema mort.

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,

  type text not null
       check (type in ('bulletin_paie', 'avis_imposition', 'piece_identite',
                       'justificatif_domicile', 'contrat_travail')),

  chemin text not null unique check (char_length(chemin) between 8 and 512),
  taille_octets integer not null check (taille_octets between 1 and 20 * 1024 * 1024),

  depose_le timestamptz not null default now()
);

comment on table public.pieces is
  'Metadonnees des documents deposes par le garant. Le contenu vit chiffre dans Storage.';

create index pieces_dossier_idx on public.pieces (dossier_id);

-- ---------------------------------------------------------------------------
-- 5. La premiere piece allonge la duree de vie du dossier
-- ---------------------------------------------------------------------------
--
-- Un dossier qui contient enfin quelque chose passe de trente jours a trois
-- mois. Fait par declencheur et non par le code applicatif : c'est une regle
-- de retention, elle ne doit pas dependre du chemin par lequel la piece est
-- arrivee.

create function public.dossier_prolonge_a_la_premiere_piece()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.dossiers
     set expire_le = greatest(expire_le, cree_le + interval '3 months'),
         statut    = case when statut = 'ouvert' then 'depot_en_cours' else statut end
   where id = new.dossier_id;
  return new;
end;
$$;

create trigger piece_prolonge_le_dossier
  after insert on public.pieces
  for each row
  execute function public.dossier_prolonge_a_la_premiere_piece();

-- ---------------------------------------------------------------------------
-- 6. Ouvrir un dossier
-- ---------------------------------------------------------------------------
--
-- Seul chemin de creation, pour la meme raison que `rejoindre_ou_creer_agence`
-- : accorder `insert` sur la table laisserait poser n'importe quel statut ou
-- n'importe quelle date d'expiration. Ici l'appelant ne choisit qu'une
-- adresse.
--
-- Le locataire arrive avant d'avoir un jeton, puisque c'est justement le
-- dossier qui le lui donnera : il appelle donc en `anon`. L'agence, elle,
-- appelle authentifiee, et le dossier lui est rattache d'office.

create function public.ouvrir_dossier(email_du_locataire text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nouvelle_reference text;
begin
  if email_du_locataire is null or position('@' in email_du_locataire) = 0 then
    raise exception 'Adresse du locataire invalide.';
  end if;

  insert into public.dossiers (agence_id, email_locataire)
  values (public.agence_courante(), lower(trim(email_du_locataire)))
  returning reference into nouvelle_reference;

  return nouvelle_reference;
end;
$$;

comment on function public.ouvrir_dossier(text) is
  'Ouvre un dossier. Rattache a l''agence si l''appelant en est membre, libre sinon.';

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
--
-- Refus par defaut partout, puis le strict necessaire. On retire d'abord les
-- droits que Supabase accorde par defaut : sans ce `revoke`, les politiques
-- seraient les seules barrieres et la moindre erreur ouvrirait tout.

alter table public.dossiers    enable row level security;
alter table public.engagements enable row level security;
alter table public.pieces      enable row level security;

revoke all on public.dossiers    from anon, authenticated, porteur_lien;
revoke all on public.engagements from anon, authenticated, porteur_lien;
revoke all on public.pieces      from anon, authenticated, porteur_lien;

revoke all on function public.ouvrir_dossier(text) from public;
grant execute on function public.ouvrir_dossier(text) to anon, authenticated;

-- --- Le dossier ------------------------------------------------------------

grant select on public.dossiers to authenticated, porteur_lien;

create policy "Une agence voit ses dossiers"
  on public.dossiers for select to authenticated
  using (agence_id = public.agence_courante());

create policy "Un porteur de lien voit le sien"
  on public.dossiers for select to porteur_lien
  using (id = public.dossier_courant());

-- Le locataire designe son garant, et c'est tout ce qu'il ecrit. Le droit
-- porte sur la colonne, la politique sur la ligne et sur le role : les deux
-- doivent ceder pour que l'ecriture passe.
grant update (email_garant) on public.dossiers to porteur_lien;

create policy "Le locataire designe son garant"
  on public.dossiers for update to porteur_lien
  using (id = public.dossier_courant() and public.partie_courante() = 'locataire')
  with check (id = public.dossier_courant() and public.partie_courante() = 'locataire');

grant update (statut, agence_id) on public.dossiers to authenticated;

create policy "Une agence fait avancer ses dossiers"
  on public.dossiers for update to authenticated
  using (agence_id = public.agence_courante())
  with check (agence_id = public.agence_courante());

-- --- L'engagement ----------------------------------------------------------
--
-- La table que le locataire ne lit jamais. C'est ici que vivent le montant et
-- le ratio, et c'est pour cela qu'ils ne sont pas des colonnes de `dossiers`.

grant select on public.engagements to authenticated, porteur_lien;

create policy "Une agence lit l engagement de ses dossiers"
  on public.engagements for select to authenticated
  using (dossier_id in (select id from public.dossiers where agence_id = public.agence_courante()));

create policy "Le garant lit son engagement"
  on public.engagements for select to porteur_lien
  using (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

grant insert, update (couvre, montant_max_cents, jusqu_au, solidaire) on public.engagements
  to porteur_lien;

create policy "Le garant declare ce qu il couvre"
  on public.engagements for insert to porteur_lien
  with check (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

create policy "Le garant corrige ce qu il couvre"
  on public.engagements for update to porteur_lien
  using (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant')
  with check (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

-- --- Les pieces ------------------------------------------------------------

grant select on public.pieces to authenticated, porteur_lien;

create policy "Une agence lit les pieces de ses dossiers"
  on public.pieces for select to authenticated
  using (dossier_id in (select id from public.dossiers where agence_id = public.agence_courante()));

create policy "Le garant lit ses pieces"
  on public.pieces for select to porteur_lien
  using (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

grant insert, delete on public.pieces to porteur_lien;

create policy "Le garant depose"
  on public.pieces for insert to porteur_lien
  with check (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

-- Il peut retirer une piece tant que le dossier n'est pas parti. Apres, la
-- decision de l'agence s'appuie dessus : la retirer reecrirait l'histoire.
create policy "Le garant retire une piece avant transmission"
  on public.pieces for delete to porteur_lien
  using (
    dossier_id = public.dossier_courant()
    and public.partie_courante() = 'garant'
    and exists (
      select 1 from public.dossiers d
       where d.id = dossier_id and d.statut in ('ouvert', 'depot_en_cours')
    )
  );
