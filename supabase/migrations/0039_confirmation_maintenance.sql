-- Confirmation applicative partagee entre les differents declencheurs.
create table public.maintenance_courante (
 unique_ligne boolean primary key default true check(unique_ligne),
 derniere_reussite timestamptz
);
insert into public.maintenance_courante(unique_ligne) values(true);
alter table public.maintenance_courante enable row level security;
revoke all on public.maintenance_courante from public,anon,authenticated,porteur_lien,serveur,depot_piece;
create function public.confirmer_maintenance()
returns boolean language sql security definer set search_path='' as $$
 update public.maintenance_courante set derniere_reussite=clock_timestamp() where unique_ligne returning true;
$$;
create function public.etat_maintenance()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('derniere_reussite',derniere_reussite) from public.maintenance_courante where unique_ligne;
$$;
revoke all on function public.confirmer_maintenance(),public.etat_maintenance() from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.confirmer_maintenance(),public.etat_maintenance() to serveur;

