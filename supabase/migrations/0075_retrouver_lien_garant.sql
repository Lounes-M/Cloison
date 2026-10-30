-- Le garant retrouve son lien seul, sans repasser par le locataire.
--
-- Meme forme que `retrouver_lien_locataire` (0067) : l'adresse et la
-- reference recues par e-mail, un dossier encore actif, et un nouveau jeton
-- qui remplace le precedent. Le lien part a l'adresse deja enregistree pour ce
-- garant, jamais a une adresse fournie par l'appelant ; la fonction ne rend
-- rien qui distingue un refus d'une adresse inconnue.
--
-- Le second garant a son propre dossier et sa propre reference (0067) : il
-- retrouve son lien avec la reference recue dans son invitation. Un dossier
-- de particulier non regle n'a pas encore de lien garant, donc rien a
-- retrouver : `emettre_jeton` le refuserait (0018).
create function public.retrouver_lien_garant(courriel text, reference_dossier text)
returns table(dossier_id uuid)
language plpgsql security definer set search_path='' as $$
declare d public.dossiers;
begin
  if courriel is null or reference_dossier is null or length(courriel)>180
    or length(reference_dossier)>100 then
    return;
  end if;
  select * into d from public.dossiers x
   where x.email_garant=lower(trim(courriel)) and x.reference=trim(reference_dossier)
     and x.expire_le>now() and not x.demonstration
     and (x.agence_id is not null or x.paye_le is not null)
   for update;
  if not found then return; end if;
  perform 1 from public.emettre_jeton(d.id,'garant','7 days');
  return query select d.id;
end $$;
revoke all on function public.retrouver_lien_garant(text,text)
  from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.retrouver_lien_garant(text,text) to serveur;
