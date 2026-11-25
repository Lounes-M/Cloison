-- search_path vide sur les fonctions que l'advisor signale, et sur les deux
-- recalculs de la colocation.
--
-- 0094 n'est pas modifiee : elle est deja appliquee. Les corps de
-- recalculer_colocation et recalculer_dossier n'utilisent que des noms
-- qualifies (public.*) ou des fonctions de pg_catalog (now, trunc, least,
-- coalesce), qui reste cherche meme quand search_path est vide. On ne
-- reecrit donc pas le corps : on fige le chemin.
--
-- agence_reinitialise_verification et journal_est_en_ecriture_seule sont les
-- deux fonctions que l'advisor marque « function_search_path_mutable ». Leurs
-- corps ne citent aucun objet de schema : new, old, current_user, coalesce
-- et raise. On les recree a l'identique, avec le chemin vide.
--
-- rls_auto_enable est un declencheur d'evenement de la plateforme, absent du
-- depot et jamais appele par l'application. Le droit d'execution par defaut
-- (public, donc anon et authenticated) ne sert a rien ici. La revocation est
-- conditionnelle : la fonction n'existe pas dans les essais locaux.
--
-- pg_net reste dans public. Le deplacer casse les appels net.http_post et
-- leurs droits. Ce n'est pas fait ici.

create or replace function public.agence_reinitialise_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.siren is distinct from old.siren or new.carte_pro is distinct from old.carte_pro then
    new.statut      := 'decouverte';
    new.verifiee_le := null;
  end if;
  return new;
end
$$;

create or replace function public.journal_est_en_ecriture_seule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'porteur_lien') then
    raise exception 'Le journal des acces ne se modifie pas.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end
$$;

alter function public.recalculer_colocation(uuid) set search_path = '';
alter function public.recalculer_dossier(uuid) set search_path = '';

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
