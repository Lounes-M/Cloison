-- Journal administratif : aucune decision ne modifie le registre financier.
create table public.decisions_paiements (
  operation uuid primary key,
  operateur uuid not null,
  reference_session text not null check (reference_session ~ '^cs_[A-Za-z0-9_]{1,196}$'),
  decision text not null check (decision in ('a_examiner','a_corriger','justifie','corrige')),
  rapport_sha256 text not null check (rapport_sha256 ~ '^[a-f0-9]{64}$'),
  rapport_observe_le timestamptz not null,
  compte_base name not null default session_user,
  inscrit_le timestamptz not null default clock_timestamp()
);
create index decisions_paiements_session on public.decisions_paiements(reference_session,inscrit_le,operation);
alter table public.decisions_paiements enable row level security;
revoke all on public.decisions_paiements from public,anon,authenticated,service_role,porteur_lien,serveur,depot_piece;

create function public.proteger_decision_paiement() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Decision administrative immuable'; end if;
  if new.rapport_observe_le < '1970-01-01'::timestamptz
    or new.rapport_observe_le > clock_timestamp()+interval '5 minutes'
    or not isfinite(new.rapport_observe_le) then
    raise exception 'Date de diagnostic invalide';
  end if;
  if not exists(select 1 from public.sessions_paiement where session_ref=new.reference_session)
    and not exists(select 1 from public.registre_paiements where reference_session=new.reference_session)
    and not exists(select 1 from public.rapprochements_paiements where reference_session=new.reference_session)
    and not exists(select 1 from public.evenements_paiements where reference_session=new.reference_session or reference_objet=new.reference_session)
    and not exists(select 1 from public.decisions_paiements where reference_session=new.reference_session) then
    raise exception 'Session administrative inconnue';
  end if;
  new.compte_base := session_user;
  new.inscrit_le := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.proteger_decision_paiement() from public,anon,authenticated,service_role,porteur_lien,serveur,depot_piece;
create trigger decisions_paiements_immuables before insert or update or delete on public.decisions_paiements
for each row execute function public.proteger_decision_paiement();
