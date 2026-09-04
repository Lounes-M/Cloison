-- La purge : ce qui separe une politique de retention d'une intention.
--
-- L'ADR 0003 a pose trois mois, puis destruction. `expire_le` existe depuis la
-- 0003, et rien ne l'appliquait : un dossier expire restait la, avec sa cle,
-- ses pieces et son journal. Cette fonction est ce qui manquait, et le test
-- qui l'accompagne est ce que la feuille de route demandait : prouver, pas
-- promettre.
--
-- Ce qu'elle fait, dans l'ordre, et pourquoi dans cet ordre.
--
-- 1. Elle retire les lignes de `storage.objects` des pieces concernees. Les
--    octets physiques, eux, ne sont pas atteints d'ici : Supabase ne les efface
--    qu'a travers son API, que cette fonction n'a pas. Ce n'est pas un trou de
--    confidentialite, c'est l'effacement cryptographique de l'ADR 0003 : la
--    cle du dossier part avec lui, et des octets scelles sans cle sont des
--    octets inertes. C'est un cout de stockage, trace dans `docs/dettes.md`.
--
-- 2. Elle supprime les dossiers expires. Tout le reste part en cascade : les
--    pieces, l'engagement, les jetons, la cle, le journal. Un seul `delete`,
--    parce que chaque table fille l'a decide a sa creation.
--
-- 3. Elle epargne l'acte signe. La feuille de route nomme le piege : « un test
--    qui le purgerait validerait un bug ». L'acte est un contrat, il survit
--    au bail (ADR 0005). Tant que l'acte n'a pas sa propre table et sa propre
--    classe de retention, un dossier `signe` ne s'expire pas.
--
-- Personne ne l'appelle par l'API : aucun droit accorde. Elle est faite pour
-- pg_cron, chaque nuit, avec les droits du proprietaire. L'ordonnancement se
-- pose depuis le tableau de bord, une fois l'extension activee :
--
--   select cron.schedule(
--     'purge-des-dossiers-expires', '17 3 * * *',
--     $$ select public.purger_les_dossiers_expires() $$
--   );
--
-- Il n'est pas dans cette migration : PGlite n'a pas pg_cron, et une migration
-- qui ne rejoue pas dans les tests n'est pas une migration de ce depot.

create function public.purger_les_dossiers_expires()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purges integer;
begin
  -- Les octets d'abord, tant que les lignes de `pieces` existent encore pour
  -- dire ou ils sont.
  delete from storage.objects o
   where o.bucket_id = 'pieces'
     and exists (
       select 1
         from public.dossiers d
        where d.expire_le < now()
          and d.statut <> 'signe'
          and o.name like d.id::text || '/%'
     );

  with supprimes as (
    delete from public.dossiers d
     where d.expire_le < now()
       and d.statut <> 'signe'
    returning d.id
  )
  select count(*) into purges from supprimes;

  return purges;
end;
$$;

comment on function public.purger_les_dossiers_expires() is
  'Supprime les dossiers expires et tout ce qui en depend, sauf les actes signes. Pour pg_cron, jamais pour l API.';

revoke all on function public.purger_les_dossiers_expires() from public;
