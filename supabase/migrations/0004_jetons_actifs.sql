-- Le jeton en cours, par dossier et par partie.
--
-- L'ADR 0006 pose la regle : le lien est reemissible, le jeton ne l'est pas.
-- Redemander son lien renvoie un jeton neuf ET revoque le precedent, sinon un
-- message oublie dans une vieille boite rouvrirait un dossier des mois plus
-- tard.
--
-- La forme suit la regle. Plutot qu'une liste de revocation qui grossit sans
-- fin, on ne garde que le `jti` COURANT : un jeton vaut si et seulement si son
-- `jti` est celui qui est stocke. Emettre remplace la ligne, ce qui revoque
-- l'ancien sans avoir a le retrouver ni a le noter nulle part.
--
-- Consequence a connaitre : aucun jeton n'est valable tant que rien n'a ete
-- emis, et il n'y en a jamais deux a la fois pour la meme partie. Le refus par
-- defaut vaut donc aussi pour les jetons.

create table public.jetons_actifs (
  dossier_id uuid not null references public.dossiers (id) on delete cascade,

  -- Le locataire et le garant partagent le role Postgres `porteur_lien` : ils
  -- ne se distinguent que par cette colonne, comme dans les politiques.
  partie text not null check (partie in ('locataire', 'garant')),

  jti uuid not null,

  emis_le   timestamptz not null default now(),
  expire_le timestamptz not null,

  primary key (dossier_id, partie),
  constraint jeton_expire_apres_emission check (expire_le > emis_le)
);

comment on table public.jetons_actifs is
  'Le seul jeton valable par dossier et par partie. Emettre remplace, donc revoque.';

-- ---------------------------------------------------------------------------
-- Verifier qu'un jeton est toujours celui qui vaut
-- ---------------------------------------------------------------------------
--
-- Appelee avant toute session, donc avant que l'appelant ait un role : elle
-- est `security definer` et ouverte a `anon`.
--
-- Elle ne divulgue rien. Il faut deja detenir le `jti` pour poser la question,
-- et la reponse est un booleen : ni l'existence du dossier, ni l'adresse, ni
-- la date d'expiration n'en sortent.

create function public.jeton_est_actif(
  le_dossier uuid,
  la_partie text,
  le_jti uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.jetons_actifs j
     where j.dossier_id = le_dossier
       and j.partie     = la_partie
       and j.jti        = le_jti
       and j.expire_le  > now()
  )
$$;

comment on function public.jeton_est_actif(uuid, text, uuid) is
  'Vrai si ce jeton est celui en cours et n''a pas expire. Ne revele rien d''autre.';

-- ---------------------------------------------------------------------------
-- Emettre, donc revoquer le precedent
-- ---------------------------------------------------------------------------
--
-- Le `jti` est tire par la base et non par l'application : c'est ce qui rend
-- impossible d'emettre deux jetons portant le meme identifiant, et ce qui evite
-- qu'un appelant choisisse le sien.

-- Renvoie le `jti` ET l'expiration : l'appelant a besoin des deux pour signer,
-- et un second aller-retour pour lire la date serait une occasion de plus de
-- voir les deux diverger.

create function public.emettre_jeton(
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
begin
  if la_partie not in ('locataire', 'garant') then
    raise exception 'Partie inconnue : %', la_partie;
  end if;

  -- Un jeton ne survit jamais au dossier qu'il ouvre : si le dossier expire
  -- dans trois jours, le lien aussi, quelle que soit la duree demandee.
  return query
  insert into public.jetons_actifs as j (dossier_id, partie, jti, expire_le)
  select d.id, la_partie, nouveau_jti, least(now() + duree, d.expire_le)
    from public.dossiers d
   where d.id = le_dossier
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

comment on function public.emettre_jeton(uuid, text, interval) is
  'Emet un jeton et revoque le precedent de la meme partie. Jamais au-dela de l''expiration du dossier.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Aucune politique : personne ne lit ni n'ecrit cette table directement. Tout
-- passe par les deux fonctions ci-dessus, qui sont le seul chemin. Une table
-- avec RLS active et zero politique refuse tout, ce qui est exactement voulu.

alter table public.jetons_actifs enable row level security;

revoke all on public.jetons_actifs from anon, authenticated, porteur_lien;

revoke all on function public.jeton_est_actif(uuid, text, uuid) from public;
revoke all on function public.emettre_jeton(uuid, text, interval) from public;

-- `anon` verifie et emet : le locataire n'a pas encore de jeton au moment ou
-- il en demande un, et le garant non plus quand il suit le lien recu.
grant execute on function public.jeton_est_actif(uuid, text, uuid) to anon, authenticated;
grant execute on function public.emettre_jeton(uuid, text, interval) to anon, authenticated;
