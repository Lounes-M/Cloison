-- Les dossiers ou les relances automatiques ont tout donne.
--
-- Les relances de depot (0052) s'arretent a trois. Passe la troisieme, plus
-- rien ne part et le dossier attend en silence : c'est a l'agence de prendre
-- le relais, par telephone ou autrement. Cette fonction rend, pour l'agence
-- courante, les dossiers encore en attente du garant qui ont recu leurs trois
-- relances sans la moindre activite depuis la derniere. Seulement des
-- identifiants de dossiers que l'agence voit deja ; la table des rappels
-- reste fermee.

create function public.dossiers_relances_epuisees()
returns setof uuid
language sql stable security definer set search_path='' as $$
  select d.id
    from public.dossiers d
    join public.rappels_dossiers r on r.dossier_id = d.id and r.nature = 'depot'
   where d.agence_id = public.agence_courante()
     and not d.demonstration
     and d.expire_le > clock_timestamp()
     and d.statut in ('ouvert', 'depot_en_cours')
     and exists(select 1 from public.courriels_sortants c where c.rappel_id = r.id)
   group by d.id, d.activite_rappel_le
  having count(*) >= 3 and d.activite_rappel_le <= max(r.cree_le)
   order by d.id
   limit 500;
$$;
revoke all on function public.dossiers_relances_epuisees()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.dossiers_relances_epuisees() to authenticated;
