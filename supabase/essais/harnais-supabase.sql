-- Reproduction minimale de ce que Supabase pose AVANT nos migrations.
--
-- A n'appliquer que sur une base locale jetable. Ce fichier ne part jamais
-- vers Supabase : la-bas, tout ce qu'il cree existe deja.
--
-- Il n'imite que ce dont les migrations dependent reellement : les quatre
-- roles, le schema `auth`, la table `auth.users` reduite a trois colonnes, et
-- `auth.uid()`. Rien de plus : un faux qui en fait trop finit par tester le
-- faux plutot que le vrai.

create extension if not exists pgcrypto;

do $harnais$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end
$harnais$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase ouvre largement le schema public par defaut : la RLS est la vraie
-- barriere, pas les droits de table. Le reproduire ici est indispensable,
-- sinon nos `revoke` n'auraient rien a retirer et les essais passeraient pour
-- de mauvaises raisons.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  email_confirmed_at timestamptz
);

-- Chez Supabase, `auth.uid()` lit le claim `sub` du jeton verifie. En local on
-- pose ce claim a la main avec `set request.jwt.claim.sub = '...'`.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;

-- ---------------------------------------------------------------------------
-- Le schema `storage`, reduit a ce que nos politiques lisent
-- ---------------------------------------------------------------------------
--
-- Ce faux-ci merite d'etre borne a haute voix. Il reproduit deux tables et le
-- fait que la RLS y est active sans aucune politique, ce qui est bien l'etat
-- ou Supabase les livre. Il permet donc de prouver qu'une clause `using` ou
-- `with check` dit ce qu'on croit, puisque c'est le meme Postgres qui
-- l'evalue.
--
-- Ce qu'il ne prouve pas, et qu'aucun faux ne pourra prouver ici : que l'API
-- Storage de Supabase passe bien par ces politiques sur chacun de ses chemins.
-- Cette partie-la se verifie contre le vrai projet, pas ici.

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now(),
  metadata   jsonb,
  unique (bucket_id, name)
);

-- Supabase ouvre les droits de table et s'en remet entierement a la RLS, qui
-- est active sans politique : tout est donc refuse tant qu'on n'en ecrit pas.
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
