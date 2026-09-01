-- Reproduction minimale de ce que Supabase pose AVANT nos migrations.
--
-- A n'appliquer que sur une base locale jetable. Ce fichier ne part jamais
-- vers Supabase : la-bas, tout ce qu'il cree existe deja.
--
-- Il n'imite que ce dont les migrations dependent reellement : les quatre
-- roles, le schema `auth`, la table `auth.users` reduite a trois colonnes, et
-- `auth.uid()`. Rien de plus — un faux qui en fait trop finit par tester le
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
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
