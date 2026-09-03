-- La cle de donnees de chaque dossier, elle-meme chiffree.
--
-- Chiffrement par enveloppe (ADR 0003) : une cle par dossier, scellee par la
-- cle maitresse qui vit chez Vercel. Ce que Postgres stocke ici n'est donc
-- exploitable par personne qui n'aurait que la base.
--
-- Une table plutot qu'une colonne de `dossiers`, pour la meme raison qu'ailleurs
-- : une politique par regle. Elle porte exactement les memes conditions que le
-- dossier, ce qui donne une propriete simple a verifier : qui voit le dossier
-- voit sa cle scellee, personne d'autre.
--
-- Pourquoi une cle scellee peut etre lue par l'agence sans dommage : sans la
-- cle maitresse, ce sont des octets inertes. Le secret protege n'est pas la
-- ligne, c'est la KEK, et elle n'est pas ici.

create table public.cles_dossier (
  dossier_id uuid primary key references public.dossiers (id) on delete cascade,

  -- Nonce, marque d'authenticite et chiffre dans un seul tampon : ce qui se
  -- perd ensemble ne peut pas se desynchroniser.
  cle_scellee bytea not null check (octet_length(cle_scellee) between 45 and 200),

  cree_le timestamptz not null default now()
);

comment on table public.cles_dossier is
  'La cle de donnees du dossier, scellee par la cle maitresse. Inerte sans elle.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.cles_dossier enable row level security;

revoke all on public.cles_dossier from anon, authenticated, porteur_lien;

grant select, insert on public.cles_dossier to authenticated, porteur_lien;

create policy "Une agence lit la cle de ses dossiers"
  on public.cles_dossier for select to authenticated
  using (dossier_id in (select id from public.dossiers where agence_id = public.agence_courante()));

create policy "Le garant lit la cle de son dossier"
  on public.cles_dossier for select to porteur_lien
  using (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

-- Le garant depose, c'est donc lui qui fait naitre la cle, a la premiere piece.
create policy "Le garant scelle la cle de son dossier"
  on public.cles_dossier for insert to porteur_lien
  with check (dossier_id = public.dossier_courant() and public.partie_courante() = 'garant');

-- Aucune politique de mise a jour ni de suppression, pour personne.
--
-- Remplacer une cle rendrait illisibles les pieces deja scellees avec la
-- precedente, sans que rien ne le signale. La seule facon de faire disparaitre
-- une cle est de supprimer le dossier, ce que la cascade fait : c'est
-- l'effacement cryptographique de l'ADR 0003, ou detruire la cle suffit a
-- rendre les pieces inutilisables meme si des copies trainent.
