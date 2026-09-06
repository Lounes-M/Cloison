-- La reservation precede l'appel Storage et survit a la mort du processus.
create table public.reservations_depot (
  chemin text primary key,
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  expire_le timestamptz not null default (clock_timestamp()+interval '15 minutes'),
  check (chemin like dossier_id::text || '/%')
);
create index reservations_depot_dossier on public.reservations_depot(dossier_id);
create index reservations_depot_expiration on public.reservations_depot(expire_le);
alter table public.reservations_depot enable row level security;
revoke all on public.reservations_depot from public,anon,authenticated,porteur_lien,depot_piece,serveur;

-- Toujours dossier puis reservation. Les horloges sont relues apres attente.
create function public.verifier_dossier_depot()
returns uuid language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare dossier uuid; d record; c jsonb;
begin
  dossier := public.dossier_courant();
  if dossier is null then return null; end if;
  c := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  select statut,expire_le into d from public.dossiers where id=dossier for update;
  if not found then return null; end if;
  if d.expire_le <= clock_timestamp()
    or d.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant')
    or c->>'role_partie' <> 'garant'
    or not exists(select 1 from public.jetons_actifs j where j.dossier_id=dossier
      and j.partie='garant' and j.jti::text=c->>'jti' and j.expire_le>clock_timestamp()) then
    return null;
  end if;
  return dossier;
end $$;

create function public.reserver_depot(le_chemin text)
returns void language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare dossier uuid;
begin
  dossier := public.verifier_dossier_depot();
  if dossier is null or le_chemin is null
    or le_chemin !~ ('^'||dossier::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or exists(select 1 from public.chemins_abandonnes where chemin=le_chemin)
    or exists(select 1 from public.objets_a_supprimer where chemin=le_chemin)
    or exists(select 1 from public.pieces where chemin=le_chemin)
    or exists(select 1 from storage.objects where bucket_id='pieces' and name=le_chemin) then
    raise exception 'Reservation refusee.' using errcode='42501';
  end if;
  -- La repetition reseau ne renouvelle jamais le delai.
  if exists(select 1 from public.reservations_depot where chemin=le_chemin and expire_le>clock_timestamp()) then return; end if;
  if (select count(*) from public.reservations_depot where dossier_id=dossier)
    +(select count(*) from public.pieces where dossier_id=dossier) >= 20 then
    raise exception 'Trop de depots en cours.' using errcode='23514';
  end if;
  insert into public.reservations_depot(chemin,dossier_id) values(le_chemin,dossier);
end $$;

create function public.depot_stockage_autorise(le_seau text,le_chemin text)
returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare dossier uuid; echeance timestamptz;
begin
  if le_seau <> 'pieces' then return false; end if;
  dossier := public.verifier_dossier_depot();
  if dossier is null then return false; end if;
  select expire_le into echeance from public.reservations_depot
    where chemin=le_chemin and dossier_id=dossier for update;
  if not found then return false; end if;
  return echeance>clock_timestamp()
    and not exists(select 1 from public.chemins_abandonnes where chemin=le_chemin)
    and not exists(select 1 from public.objets_a_supprimer where chemin=le_chemin);
end $$;
drop policy "Le serveur depose pour une capacite active" on storage.objects;
create policy "Le serveur depose pour une capacite active" on storage.objects
for insert to depot_piece with check (public.depot_stockage_autorise(bucket_id,name));

create function public.consommer_reservation_depot()
returns trigger language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare echeance timestamptz;
begin
  perform 1 from public.dossiers where id=new.dossier_id for update;
  if current_setting('role',true)='depot_piece' then
    if public.dossier_courant() is distinct from new.dossier_id then
      raise exception 'Reservation indisponible.' using errcode='23514';
    end if;
    if public.verifier_dossier_depot() is null then
      raise exception 'Reservation indisponible.' using errcode='23514';
    end if;
  end if;
  select expire_le into echeance from public.reservations_depot
    where chemin=new.chemin and dossier_id=new.dossier_id for update;
  -- Seul le proprietaire peut preparer une fixture ou un import historique.
  -- Aucun role applicatif ne peut fabriquer de metadonnees sans reservation.
  if not found and current_setting('role',true)='depot_piece' then
    raise exception 'Reservation indisponible.' using errcode='23514';
  end if;
  if found then
    if echeance<=clock_timestamp() or not exists(select 1 from storage.objects
      where bucket_id='pieces' and name=new.chemin) then
      raise exception 'Reservation indisponible.' using errcode='23514';
    end if;
    delete from public.reservations_depot where chemin=new.chemin;
  end if;
  return new;
end $$;
create trigger b_piece_reservation before insert on public.pieces
for each row execute function public.consommer_reservation_depot();

create function public.reprendre_depots_inacheves()
returns integer language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare candidat record; echeance timestamptz; nombre integer:=0;
begin
  for candidat in select chemin,dossier_id from public.reservations_depot
    where expire_le<=clock_timestamp() order by dossier_id,chemin limit 100 loop
    perform 1 from public.dossiers where id=candidat.dossier_id for update skip locked;
    if not found then continue; end if;
    select expire_le into echeance from public.reservations_depot
      where chemin=candidat.chemin for update skip locked;
    if not found then continue; end if;
    if echeance>clock_timestamp() then continue; end if;
    if not exists(select 1 from public.pieces where chemin=candidat.chemin) then
      insert into public.chemins_abandonnes(chemin,dossier_id)
        values(candidat.chemin,candidat.dossier_id) on conflict do nothing;
      insert into public.objets_a_supprimer(chemin) values(candidat.chemin) on conflict do nothing;
    end if;
    delete from public.reservations_depot where chemin=candidat.chemin;
    nombre:=nombre+1;
  end loop;
  return nombre;
end $$;

revoke all on function public.verifier_dossier_depot(),public.reserver_depot(text),
  public.depot_stockage_autorise(text,text),public.consommer_reservation_depot(),public.reprendre_depots_inacheves()
from public,anon,authenticated,porteur_lien,depot_piece,serveur;
grant execute on function public.reserver_depot(text),public.depot_stockage_autorise(text,text) to depot_piece;
grant execute on function public.reprendre_depots_inacheves() to serveur;

-- Une ligne de piece atteste du parcours serveur de validation et de stockage.
revoke insert on public.pieces from porteur_lien;
grant select,insert on public.pieces to depot_piece;
create policy "Le serveur inscrit le depot valide" on public.pieces
for insert to depot_piece with check (dossier_id=public.dossier_courant() and public.partie_courante()='garant');
create policy "Le serveur relit le depot inscrit" on public.pieces
for select to depot_piece using (dossier_id=public.dossier_courant() and public.partie_courante()='garant');
