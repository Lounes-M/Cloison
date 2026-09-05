-- Audit : toutes les lectures de capacite utilisent le contexte PostgREST JSON
-- et le jeton actif. Aucun repli sur les anciens parametres scalaires.
create or replace function public.dossier_courant()
returns uuid language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare c jsonb; resultat uuid;
begin
  c := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  select d.id into resultat
    from public.dossiers d join public.jetons_actifs j on j.dossier_id = d.id
   where d.id = (c->>'dossier_id')::uuid
     and j.partie = c->>'role_partie' and j.jti = (c->>'jti')::uuid
     and j.expire_le > now() and d.expire_le > now();
  return resultat;
exception when invalid_text_representation then return null;
end $$;

create or replace function public.partie_courante()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select case when public.dossier_courant() is not null
    then nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role_partie' end
$$;

create or replace function public.agence_courante()
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select m.agence_id from public.membres_agence m
    join public.agences a on a.id = m.agence_id
    join auth.users u on u.id = m.utilisateur_id
   where m.utilisateur_id = auth.uid() and a.statut <> 'suspendue'
     and nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'='aal2'
     and u.email_confirmed_at is not null
     and lower(split_part(u.email, '@', 2)) = a.domaine
$$;

-- Une exclusion reste effective, y compris lors du prochain rattachement.
create table public.exclusions_agence (
  agence_id uuid not null references public.agences(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (agence_id, utilisateur_id)
);
alter table public.exclusions_agence enable row level security;
revoke all on public.exclusions_agence from public, anon, authenticated, porteur_lien, serveur;

create function public.memoriser_exclusion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Lors d'une suppression d'utilisateur ou d'agence, la cascade suffit.
  if exists(select 1 from auth.users where id=old.utilisateur_id)
     and exists(select 1 from public.agences where id=old.agence_id) then
    insert into public.exclusions_agence(agence_id,utilisateur_id)
    values(old.agence_id,old.utilisateur_id) on conflict do nothing;
  end if;
  return old;
end $$;
create trigger membre_exclu after delete on public.membres_agence
for each row execute function public.memoriser_exclusion();

create function public.refuser_membre_exclu()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists(select 1 from public.exclusions_agence
    where agence_id=new.agence_id and utilisateur_id=new.utilisateur_id)
    or exists(select 1 from public.agences where id=new.agence_id and statut='suspendue') then
    raise exception 'Rattachement refuse.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger membre_verifie before insert on public.membres_agence
for each row execute function public.refuser_membre_exclu();

-- Le verrou survit au retrait des pieces et a la revocation d'un jeton.
alter table public.dossiers add column garant_verrouille boolean not null default false;
alter table public.dossiers add column loyer_verrouille boolean not null default false;
update public.dossiers d set
  garant_verrouille = d.email_garant is not null and (
    exists(select 1 from public.engagements e where e.dossier_id=d.id)
    or exists(select 1 from public.pieces p where p.dossier_id=d.id)
    or exists(select 1 from public.jetons_actifs j where j.dossier_id=d.id and j.partie='garant')),
  loyer_verrouille = exists(select 1 from public.engagements e where e.dossier_id=d.id);

create function public.verrouiller_donnees_garant()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.dossiers set garant_verrouille=true,
    loyer_verrouille=loyer_verrouille or tg_table_name='engagements'
    where id=new.dossier_id;
  return new;
end $$;
create trigger engagement_verrouille after insert on public.engagements
for each row execute function public.verrouiller_donnees_garant();
create trigger piece_verrouille after insert on public.pieces
for each row execute function public.verrouiller_donnees_garant();
create trigger invitation_verrouille after insert or update on public.jetons_actifs
for each row when (new.partie='garant') execute function public.verrouiller_donnees_garant();

create function public.proteger_dossier()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.garant_verrouille and old.email_garant is not null and new.email_garant is distinct from old.email_garant then
    raise exception 'Le garant invite ne peut pas etre remplace dans ce dossier.' using errcode='42501';
  end if;
  if old.loyer_verrouille and old.loyer_cents is not null
    and new.loyer_cents is distinct from old.loyer_cents then
    raise exception 'Le loyer est fige apres la declaration du garant.' using errcode='42501';
  end if;
  if current_user in ('authenticated','porteur_lien') and new.statut is distinct from old.statut then
    if current_user <> 'authenticated' or not (
      (old.statut='complet' and new.statut='transmis')
      or (old.statut in ('complet','garant_insuffisant','transmis') and new.statut='refuse')
    ) then raise exception 'Transition interdite.' using errcode='42501'; end if;
  end if;
  if old.statut in ('transmis','signe','refuse','expire') and
    (new.email_garant is distinct from old.email_garant or new.loyer_cents is distinct from old.loyer_cents) then
    raise exception 'Ce dossier est fige.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger dossier_protege before update on public.dossiers
for each row execute function public.proteger_dossier();

create function public.refuser_ecriture_apres_transmission()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare etat text;
begin
  select statut into etat from public.dossiers where id=new.dossier_id for update;
  if etat not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then
    raise exception 'Ce dossier est fige.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger engagement_avant_transmission before insert or update on public.engagements
for each row execute function public.refuser_ecriture_apres_transmission();
create trigger piece_avant_transmission before insert on public.pieces
for each row execute function public.refuser_ecriture_apres_transmission();

-- Authentifie mais non rattache : ne pas retomber sur la porte locataire.
create function public.verifier_ouverture_agence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='authenticated'
    and new.agence_id is null then
    raise exception 'Agence verifiee requise.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger ouverture_agence_verifiee before insert on public.dossiers
for each row execute function public.verifier_ouverture_agence();

-- Les traces demeurent mais ne bloquent pas la suppression du compte.
alter table public.journal_acces drop constraint journal_acces_acteur_id_fkey;
alter table public.journal_acces add foreign key (acteur_id) references auth.users(id) on delete set null;

revoke all on function public.memoriser_exclusion() from public;
revoke all on function public.refuser_membre_exclu() from public;
revoke all on function public.verrouiller_donnees_garant() from public;
revoke all on function public.proteger_dossier() from public;
revoke all on function public.refuser_ecriture_apres_transmission() from public;
revoke all on function public.verifier_ouverture_agence() from public;

-- La designation et la rotation de capacite forment une seule transaction.
create function public.designer_garant_avec_lien(courriel text)
returns table(jti uuid, expire_le timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.dossiers;
begin
  if public.partie_courante() is distinct from 'locataire' then
    raise exception 'Acces refuse.' using errcode='42501';
  end if;
  select * into d from public.dossiers where id=public.dossier_courant() for update;
  if not found or courriel is null or length(courriel)>180
    or courriel !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or lower(trim(courriel))=d.email_locataire then
    raise exception 'Designation refusee.' using errcode='42501';
  end if;
  update public.dossiers set email_garant=lower(trim(courriel)) where id=d.id;
  return query select e.jti,e.expire_le from public.emettre_jeton(d.id,'garant','7 days') e;
end $$;
revoke all on function public.designer_garant_avec_lien(text) from public;
grant execute on function public.designer_garant_avec_lien(text) to porteur_lien;
