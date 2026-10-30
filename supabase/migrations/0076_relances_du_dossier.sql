-- Dire a l'agence combien de relances le garant a deja recues.
--
-- Les relances automatiques (0052) partent sans que l'agence les voie : la
-- fiche du dossier ne disait pas si le garant avait ete relance, ni quand.
-- Cette fonction rend le nombre de relances de depot mises en file pour un
-- dossier de l'agence courante et la date de la derniere. Rien sur le
-- destinataire ni sur le contenu du courriel : la table des rappels reste
-- fermee aux agences.

create function public.relances_du_dossier(le_dossier uuid)
returns table(nombre integer, derniere timestamptz)
language sql stable security definer set search_path='' as $$
  select count(*)::integer, max(r.cree_le)
    from public.rappels_dossiers r
    join public.dossiers d on d.id = r.dossier_id
   where d.id = le_dossier
     and d.agence_id = public.agence_courante()
     and r.nature = 'depot'
     and exists(select 1 from public.courriels_sortants c where c.rappel_id = r.id);
$$;
revoke all on function public.relances_du_dossier(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.relances_du_dossier(uuid) to authenticated;
