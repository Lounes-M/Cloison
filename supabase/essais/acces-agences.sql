-- Essais du modele d'acces de l'ADR 0002, a lancer a la main.
--
-- Ce ne sont pas des tests automatises — il n'y en a pas encore dans le projet
-- (voir docs/dettes.md). C'est un scenario rejouable qui verifie que les
-- regles d'acces font ce que l'ADR promet, sur un Postgres local.
--
-- Il a deja servi : il a trouve une variable PL/pgSQL homonyme d'une colonne,
-- qui rendait `rejoindre_ou_creer_agence` inutilisable a chaque appel. La
-- migration seule s'appliquait sans broncher.
--
--   initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-k /tmp -p 5433" start
--   createdb -h /tmp -p 5433 essai
--   psql -h /tmp -p 5433 -d essai -v ON_ERROR_STOP=1 \
--        -f supabase/essais/harnais-supabase.sql \
--        -f supabase/migrations/0001_demandes_agence.sql \
--        -f supabase/migrations/0002_agences_et_membres.sql
--   psql -h /tmp -p 5433 -d essai -f supabase/essais/acces-agences.sql
--
-- Les blocs marques « REFUS attendu » DOIVENT produire une erreur ou zero
-- ligne modifiee. Une reussite y serait le probleme.
--
-- `ON_ERROR_STOP` est desactive volontairement : le fichier continue apres un
-- refus, puisque les refus sont ce qu'on vient observer.

\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'marie@agence-lyon3.fr', now()),
  ('22222222-2222-2222-2222-222222222222', 'paul@agence-lyon3.fr',  now()),
  ('33333333-3333-3333-3333-333333333333', 'jean@gmail.com',        now()),
  ('44444444-4444-4444-4444-444444444444', 'lea@agence-lyon3.fr',   null),
  ('55555555-5555-5555-5555-555555555555', 'sam@autre-agence.fr',   now());

\echo '=== 1. Marie cree son agence, et en devient admin ==='
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.rejoindre_ou_creer_agence('Agence Lyon 3') is not null as agence_creee;
select role as role_de_marie from public.membres_agence;

\echo '=== 2. Rappel idempotent : meme agence, pas de doublon ==='
select public.rejoindre_ou_creer_agence('Autre nom') = (select id from public.agences) as idempotent;
reset role;
select count(*) as nb_agences from public.agences;

\echo '=== 3. Paul, meme domaine, rejoint comme membre ==='
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.rejoindre_ou_creer_agence(null) is not null as paul_rattache;
reset role;
select count(*) as nb_agences_apres_paul from public.agences;
select role as role_de_paul from public.membres_agence where utilisateur_id = '22222222-2222-2222-2222-222222222222';

\echo '=== 4. Jean (gmail) : REFUS attendu ==='
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.rejoindre_ou_creer_agence('Agence Gmail');
reset role;

\echo '=== 5. Lea (adresse non confirmee) : REFUS attendu ==='
set role authenticated; set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select public.rejoindre_ou_creer_agence(null);
reset role;

\echo '=== 6. Sam, autre domaine, cree une deuxieme agence ==='
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select public.rejoindre_ou_creer_agence('Autre Agence') is not null as sam_cree;

\echo '=== 7. Cloisonnement : Sam ne voit que la sienne ==='
select count(*) as agences_vues_par_sam from public.agences;
select count(*) as collegues_vus_par_sam from public.membres_agence;
reset role;

\echo '=== 8. Marie (admin) tente de se verifier elle-meme : REFUS attendu ==='
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.agences set statut = 'verifiee' where id = public.agence_courante();

\echo '=== 9. Marie declare son SIREN : autorise ==='
update public.agences set siren = '552100554', carte_pro = 'CPI 6901 2020 000 012 345'
  where id = public.agence_courante();
select siren, statut from public.agences;

\echo '=== 10. Paul (membre simple) tente de modifier : REFUS attendu (0 ligne) ==='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.agences set nom = 'Detourne' where id = public.agence_courante();

\echo '=== 11. Paul tente de s ajouter a une autre agence : REFUS attendu ==='
insert into public.membres_agence (agence_id, utilisateur_id, role)
  values ((select id from public.agences limit 1), '22222222-2222-2222-2222-222222222222', 'admin');
reset role;

\echo '=== 12. Verification impossible sans les pieces : REFUS attendu ==='
update public.agences set statut = 'verifiee', verifiee_le = now()
  where domaine = 'autre-agence.fr';

\echo '=== 13. Verification manuelle (toi, au tableau de bord) : autorisee ==='
update public.agences set statut = 'verifiee', verifiee_le = now() where domaine = 'agence-lyon3.fr';
select domaine, statut from public.agences order by domaine;

\echo '=== 14. Marie change son SIREN : la verification retombe ==='
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.agences set siren = '999999999' where id = public.agence_courante();
reset role;
select domaine, statut, verifiee_le is null as date_effacee from public.agences where domaine = 'agence-lyon3.fr';

\echo '=== 15. Un porteur de lien ne touche a rien ==='
set role porteur_lien;
select count(*) from public.agences;
reset role;
