-- La barriere de l'ADR 0002, rendue reelle.
--
-- « La creation de compte est libre. Ce qui est controle, c'est le droit
-- d'envoyer un lien a un vrai garant. » Jusqu'ici, rien en base ne
-- l'empechait : une agence en `decouverte` pouvait appeler `ouvrir_dossier`,
-- et le lien partait. La barriere n'existait que dans l'intention.
--
-- Elle vit desormais dans la fonction elle-meme. Une regle qui ne tiendrait
-- que dans l'action serveur s'oublierait au deuxieme chemin d'ecriture, et
-- `ouvrir_dossier_avec_lien` en est deja un : il appelle celle-ci, donc il
-- herite du refus sans qu'on ait rien a lui ajouter.
--
-- `anon` n'est pas concerne : le locataire ouvre pour lui-meme, sans agence,
-- et c'est la porte principale du produit.
--
-- `create or replace` : les droits accordes par la 0003 survivent.

create or replace function public.ouvrir_dossier(email_du_locataire text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nouvelle_reference text;
  l_agence           uuid;
  statut_agence      text;
begin
  if email_du_locataire is null or position('@' in email_du_locataire) = 0 then
    raise exception 'Adresse du locataire invalide.';
  end if;

  l_agence := public.agence_courante();

  if l_agence is not null then
    select a.statut into statut_agence from public.agences a where a.id = l_agence;

    if statut_agence is distinct from 'verifiee' then
      -- Le meme code que les autres refus d'acces, pour que le code applicatif
      -- le range avec eux. Le message est ecrit pour etre lu.
      raise exception 'Cette agence n''est pas encore verifiee : elle ne peut pas ouvrir de dossier pour un vrai locataire.'
        using errcode = '42501';
    end if;
  end if;

  insert into public.dossiers (agence_id, email_locataire)
  values (l_agence, lower(trim(email_du_locataire)))
  returning reference into nouvelle_reference;

  return nouvelle_reference;
end;
$$;

comment on function public.ouvrir_dossier(text) is
  'Ouvre un dossier. Libre pour le locataire ; reserve aux agences verifiees quand l''appelant en est membre.';
