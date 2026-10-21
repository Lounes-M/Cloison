-- Reinitialisation du second facteur d'un collaborateur par un administrateur.
--
-- Un telephone perdu verrouille la personne : sans aal2, `agence_courante()`
-- rend null et rien ne s'ouvre. Les codes de secours natifs de Supabase ne
-- sont pas disponibles (#181). Un administrateur de la meme agence, lui-meme
-- en aal2, peut donc retirer les facteurs de son collaborateur apres l'avoir
-- reconnu par un second canal. La personne se reconnecte par son lien
-- habituel et enregistre une nouvelle application avant tout acces.
--
-- Garde-fous : jamais sur soi (un administrateur seul suit la procedure
-- operateur), seulement sur un membre ou administrateur rattache a la meme
-- agence, sessions de la cible fermees dans le meme geste, chaque usage
-- journalise.

alter table public.journal_administration_agence drop constraint journal_administration_agence_action_check;
alter table public.journal_administration_agence add constraint journal_administration_agence_action_check
 check(action in ('role','exclusion','readmission','approbation','refus','mfa'));

create function public.reinitialiser_mfa_collaborateur(cible uuid)
returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then
  raise exception 'Administration refusee' using errcode='42501';
 end if;
 if cible is null or cible=auth.uid() then return false; end if;
 -- Le verrou sur la ligne de membre ordonne ce geste avec une exclusion ou un
 -- changement de role concurrents.
 perform 1 from public.membres_agence m
  where m.agence_id=agence and m.utilisateur_id=cible for update;
 if not found then return false; end if;
 delete from auth.mfa_factors f where f.user_id=cible;
 -- Les sessions encore ouvertes gardent leur aal2 jusqu'a expiration du
 -- jeton : les supprimer empeche tout rafraichissement.
 delete from auth.sessions s where s.user_id=cible;
 insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action)
  values(agence,auth.uid(),cible,'mfa');
 return true;
end;
$$;
revoke all on function public.reinitialiser_mfa_collaborateur(uuid) from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.reinitialiser_mfa_collaborateur(uuid) to authenticated;
