-- Une tentative stable permet de rejouer une creation Stripe sans doublon.
create table public.sessions_paiement (
  dossier_id uuid primary key references public.dossiers(id) on delete cascade,
  tentative uuid not null default gen_random_uuid(),
  session_ref text unique,
  cree_le timestamptz not null default now()
);
alter table public.sessions_paiement enable row level security;
revoke all on public.sessions_paiement from public, anon, authenticated, porteur_lien, serveur;
grant select,insert,update on public.sessions_paiement to serveur;
create policy "Le serveur reserve une session" on public.sessions_paiement
for all to serveur using (true) with check (true);

-- Une insertion anonyme ne doit pas contourner le formulaire et son debit.
revoke insert on public.demandes_agence from anon;
grant insert(nom_agence,email,ville,dossiers_par_an,message,source) on public.demandes_agence to serveur;
create policy "Le serveur inscrit une demande" on public.demandes_agence
for insert to serveur with check (statut='nouvelle');

-- Les comptages de pieces concurrentes sont serialises par le dossier.
create or replace function public.piece_refusee_au_dela_du_plafond()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare nombre integer; volume bigint;
begin
  perform 1 from public.dossiers where id=new.dossier_id for update;
  select count(*),coalesce(sum(taille_octets),0) into nombre,volume
    from public.pieces where dossier_id=new.dossier_id;
  if nombre>=20 then raise exception 'Ce dossier contient deja vingt pieces, le maximum.' using errcode='check_violation'; end if;
  if volume+new.taille_octets>60*1024*1024 then raise exception 'Ce dossier depasserait soixante megaoctets au total.' using errcode='check_violation'; end if;
  return new;
end $$;
