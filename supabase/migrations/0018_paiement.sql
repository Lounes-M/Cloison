-- Encaisser : le paiement du locataire, et ce que l'agence devra.
--
-- Le modele etait ecrit sur la page de tarifs. Le rendre vrai demande trois
-- choses, et une regle qui ne se negocie pas.
--
-- 1. Un dossier ouvert par un locataire se regle une fois, neuf euros, pour
--    trois mois de coffre. Tant qu'il n'est pas regle, aucun lien ne part vers
--    le garant : c'est `emettre_jeton` qui refuse, pas l'ecran. Un dossier
--    ouvert par une agence, ou une demonstration, n'attend rien du locataire.
--
-- 2. Un acte signe vaut vingt-neuf euros a l'agence. La ligne se cree seule
--    quand le dossier passe a `signe`, par declencheur : ce n'est pas au code
--    de se souvenir de facturer.
--
-- 3. Le seul chemin pour marquer un dossier regle est un appel de Stripe,
--    verifie par sa signature, puis porte jusqu'ici par un role Postgres
--    dedie, `serveur`, que seule notre signature de jeton peut faire exister.
--    Pas de secret partage entre deux tables : la barriere est le role, comme
--    partout ailleurs dans ce depot (ADR 0002).
--
-- La regle : le garant ne paie jamais. Rien ici ne lui est accorde, et le test
-- des invariants tient le code du meme cote.

-- ---------------------------------------------------------------------------
-- 1. Le role du serveur
-- ---------------------------------------------------------------------------
--
-- Un quatrieme role, apres `anon`, `authenticated` et `porteur_lien`. Il ne
-- correspond a aucune personne : c'est notre serveur, quand il agit sur la foi
-- d'un evenement Stripe verifie. Il n'a aucun droit de table ; seule une
-- fonction lui est ouverte.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'serveur') then
    create role serveur nologin noinherit;
  end if;
end
$$;

grant serveur to authenticator;
grant usage on schema public to serveur;

-- ---------------------------------------------------------------------------
-- 2. Ce que le locataire a regle
-- ---------------------------------------------------------------------------

alter table public.dossiers
  add column paye_le      timestamptz null,
  add column paiement_ref text null unique
      check (paiement_ref is null or char_length(paiement_ref) between 8 and 200),
  add constraint paiement_et_sa_date check ((paye_le is null) = (paiement_ref is null));

comment on column public.dossiers.paye_le is
  'Quand le locataire a regle ses trois mois de coffre. Nul pour un dossier d agence ou de demonstration.';

-- Aucun droit d'ecriture sur ces colonnes pour personne : seule la fonction
-- ci-dessous les remplit, et seul `serveur` l'appelle.

create function public.marquer_dossier_paye(le_dossier uuid, la_reference text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deja text;
begin
  select d.paiement_ref into deja from public.dossiers d where d.id = le_dossier;

  if not found then
    return false;
  end if;

  -- Stripe peut livrer un evenement deux fois : la meme reference est un
  -- succes, une autre reference sur un dossier deja regle est une anomalie.
  if deja is not null then
    if deja = la_reference then
      return true;
    end if;
    raise exception 'Dossier deja regle avec une autre reference.' using errcode = '23505';
  end if;

  update public.dossiers
     set paye_le = now(), paiement_ref = la_reference
   where id = le_dossier;

  return true;
end;
$$;

comment on function public.marquer_dossier_paye(uuid, text) is
  'Marque un dossier regle. Appelee par le serveur sur la foi d un evenement Stripe verifie, jamais par une personne.';

revoke all on function public.marquer_dossier_paye(uuid, text) from public;
grant execute on function public.marquer_dossier_paye(uuid, text) to serveur;

-- ---------------------------------------------------------------------------
-- 3. Pas de lien au garant sans reglement
-- ---------------------------------------------------------------------------
--
-- `create or replace` : les droits de la 0004 survivent. Le corps ne change
-- que par la garde en tete.

create or replace function public.emettre_jeton(
  le_dossier uuid,
  la_partie text,
  duree interval
)
returns table (jti uuid, expire_le timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nouveau_jti uuid := gen_random_uuid();
  d record;
begin
  if la_partie not in ('locataire', 'garant') then
    raise exception 'Partie inconnue : %', la_partie;
  end if;

  -- Le lien du garant est ce que le locataire achete. Un dossier d'agence ou
  -- de demonstration n'attend rien de lui ; un dossier qu'il a ouvert
  -- lui-meme, si.
  if la_partie = 'garant' then
    select paye_le, agence_id, demonstration into d
      from public.dossiers where id = le_dossier;

    if found and d.paye_le is null and d.agence_id is null and not d.demonstration then
      raise exception 'Ce dossier n''est pas encore regle : le lien du garant attend le paiement.'
        using errcode = '42501';
    end if;
  end if;

  return query
  insert into public.jetons_actifs as j (dossier_id, partie, jti, expire_le)
  select x.id, la_partie, nouveau_jti, least(now() + duree, x.expire_le)
    from public.dossiers x
   where x.id = le_dossier
  on conflict (dossier_id, partie) do update
     set jti       = excluded.jti,
         emis_le   = now(),
         expire_le = excluded.expire_le
  returning j.jti, j.expire_le;

  if not found then
    raise exception 'Dossier introuvable.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ce que l'agence doit, acte par acte
-- ---------------------------------------------------------------------------

create table public.factures_actes (
  id uuid primary key default gen_random_uuid(),
  agence_id  uuid not null references public.agences (id),
  dossier_id uuid not null unique references public.dossiers (id) on delete restrict,
  montant_cents integer not null check (montant_cents > 0),
  cree_le timestamptz not null default now(),
  paye_le timestamptz null,
  paiement_ref text null unique
);

comment on table public.factures_actes is
  'Un acte signe, vingt-neuf euros. Cree par declencheur au passage a signe ; regle plus tard.';

-- `on delete restrict` : un dossier dont l'acte a ete facture ne se purge pas.
-- C'est coherent avec la 0017, qui epargne deja les dossiers signes.

alter table public.factures_actes enable row level security;
revoke all on public.factures_actes from anon, authenticated, porteur_lien, serveur;

grant select on public.factures_actes to authenticated;

create policy "Une agence lit ses factures"
  on public.factures_actes for select to authenticated
  using (agence_id = public.agence_courante());

create function public.facture_a_la_signature()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.statut = 'signe' and old.statut is distinct from 'signe' and new.agence_id is not null
     and not new.demonstration then
    insert into public.factures_actes (agence_id, dossier_id, montant_cents)
    values (new.agence_id, new.id, 2900)
    on conflict (dossier_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger signature_facture_l_acte
  after update of statut on public.dossiers
  for each row
  execute function public.facture_a_la_signature();
