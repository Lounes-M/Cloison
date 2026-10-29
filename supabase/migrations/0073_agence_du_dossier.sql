-- Dire au locataire et au garant quelle agence suit le dossier.
--
-- Un dossier rejoint une agence par le domaine (0022), par le lien de
-- candidature (0070) ou nait chez elle. Ni le locataire ni le garant ne
-- voyaient jusqu'ici a qui leurs informations etaient transmises, alors que
-- le garant depose ses pieces pour cette agence. Cette fonction leur rend le
-- nom de l'agence, et le libelle et la ville du logement s'il y en a un :
-- rien d'autre, et seulement pour le dossier que leur lien designe. Le second
-- garant (0067) voit l'agence et le logement du dossier principal.

create function public.agence_de_mon_dossier()
returns table(agence text, logement text, ville text)
language sql stable security definer set search_path='' as $$
  select a.nom, l.libelle, l.ville
    from public.dossiers d
    left join public.dossiers p on p.id = d.dossier_principal
    join public.agences a on a.id = coalesce(d.agence_id, p.agence_id)
    left join public.logements l on l.id = coalesce(d.logement_id, p.logement_id)
   where d.id = public.dossier_courant()
     and not d.demonstration;
$$;
revoke all on function public.agence_de_mon_dossier()
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.agence_de_mon_dossier() to porteur_lien;
