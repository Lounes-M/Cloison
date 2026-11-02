-- Relancer le garant a nouveau, a la main, une fois les relances epuisees.
--
-- Apres trois relances de depot sans reponse (0052), Cloison se tait : la
-- carte du pilotage (0077) et l'alerte par courriel (0078) passent la main a
-- l'agence. Souvent un appel debloque la situation et l'agence veut que les
-- relances reprennent. Cette fonction ouvre un nouveau cycle de trois
-- relances : `relances_depuis` marque son debut, et seules les relances
-- posterieures comptent desormais. La revision du dossier change, ce qui
-- rend obsolete tout rappel encore en file (dont l'alerte d'epuisement) et
-- donne des cles neuves aux relances du nouveau cycle. L'activite du dossier
-- ne bouge pas : la premiere relance part au prochain passage, sous reserve
-- de l'espacement de trois jours entre deux relances, qui vaut d'un cycle a
-- l'autre.
--
-- Garde-fous : agence courante ; administrateur, ou responsable attribue du
-- dossier ; dossier en attente du garant, ni echu ni de demonstration, avec
-- une adresse de garant ; relances du cycle en cours epuisees (meme regle que
-- la 0077). La colonne n'est accordee en ecriture a personne.

alter table public.dossiers add column relances_depuis timestamptz;

create function public.relancer_garant(le_dossier uuid)
returns boolean
language plpgsql security definer set search_path='' as $$
declare
 agence uuid:=public.agence_courante();
 d public.dossiers;
begin
 if agence is null or le_dossier is null then return false;end if;
 select * into d from public.dossiers
  where id=le_dossier and agence_id=agence and expire_le>clock_timestamp()
  for update;
 if not found or d.demonstration or d.email_garant is null
  or d.statut not in ('ouvert','depot_en_cours') then
  return false;
 end if;
 if not public.est_admin_agence() and not exists(
  select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=auth.uid()) then
  return false;
 end if;
 if not exists(
  select 1 from public.rappels_dossiers r
   where r.dossier_id=d.id and r.nature='depot'
     and r.cree_le>coalesce(d.relances_depuis,'-infinity')
     and exists(select 1 from public.courriels_sortants c where c.rappel_id=r.id)
  having count(*)>=3 and d.activite_rappel_le<=max(r.cree_le)) then
  return false;
 end if;
 update public.dossiers set relances_depuis=clock_timestamp(),revision_rappel=gen_random_uuid()
  where id=d.id;
 return true;
end;
$$;
revoke all on function public.relancer_garant(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.relancer_garant(uuid) to authenticated;

-- Le compteur de la fiche et la carte du pilotage ne voient que le cycle en cours.
create or replace function public.relances_du_dossier(le_dossier uuid)
returns table(nombre integer, derniere timestamptz)
language sql stable security definer set search_path='' as $$
  select count(*)::integer, max(r.cree_le)
    from public.rappels_dossiers r
    join public.dossiers d on d.id = r.dossier_id
   where d.id = le_dossier
     and d.agence_id = public.agence_courante()
     and r.nature = 'depot'
     and r.cree_le > coalesce(d.relances_depuis, '-infinity')
     and exists(select 1 from public.courriels_sortants c where c.rappel_id = r.id);
$$;

create or replace function public.dossiers_relances_epuisees()
returns setof uuid
language sql stable security definer set search_path='' as $$
  select d.id
    from public.dossiers d
    join public.rappels_dossiers r on r.dossier_id = d.id and r.nature = 'depot'
   where d.agence_id = public.agence_courante()
     and not d.demonstration
     and d.expire_le > clock_timestamp()
     and d.statut in ('ouvert', 'depot_en_cours')
     and r.cree_le > coalesce(d.relances_depuis, '-infinity')
     and exists(select 1 from public.courriels_sortants c where c.rappel_id = r.id)
   group by d.id, d.activite_rappel_le
  having count(*) >= 3 and d.activite_rappel_le <= max(r.cree_le)
   order by d.id
   limit 500;
$$;

-- Les relances de depot et l'alerte d'epuisement comptent par cycle.
create or replace function public.programmer_rappels() returns integer
language plpgsql security definer set search_path='' as $$
declare total integer;ajoutes integer;
begin
 perform pg_advisory_xact_lock(525200,1);
 select count(*) into total from public.rappels_dossiers where cree_le>=clock_timestamp()-interval '1 day';
 if total>=200 then return 0;end if;
 with candidats as (
  select d.id dossier_id,d.agence_id,'depot'::text nature,null::uuid membre_id,d.revision_rappel,d.expire_le,lower(d.email_garant) email,
   d.id::text||'/depot/'||d.revision_rappel::text||'/'||(1+(select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot' and r.cree_le>coalesce(d.relances_depuis,'-infinity')))::text identite
  from public.dossiers d join public.agences a on a.id=d.agence_id and a.statut='verifiee'
  join public.reglages_rappels g on g.agence_id=a.id
  where not d.demonstration and d.expire_le>clock_timestamp() and d.email_garant is not null and g.relance_jours>0
   and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>g.relance_jours)
   and (d.statut in ('ouvert','depot_en_cours') or (d.statut in ('complet','garant_insuffisant') and exists(select 1 from public.complements_documentaires c where c.dossier_id=d.id and c.etat='demande')))
   and (select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot' and r.cree_le>coalesce(d.relances_depuis,'-infinity'))<3
   and not exists(select 1 from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot' and r.cree_le>clock_timestamp()-interval '3 days')
  union all
  select d.id,d.agence_id,'echeance',m.utilisateur_id,d.revision_rappel,d.expire_le,lower(u.email),
   d.id::text||'/echeance/'||m.utilisateur_id::text||'/'||extract(epoch from d.expire_le)::text
  from public.dossiers d join public.agences a on a.id=d.agence_id and a.statut='verifiee'
  join public.reglages_rappels g on g.agence_id=a.id
  join public.membres_agence m on m.agence_id=d.agence_id join auth.users u on u.id=m.utilisateur_id
  left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
  where not d.demonstration and g.echeance_jours>0 and d.expire_le>clock_timestamp()
   and d.expire_le<=clock_timestamp()+make_interval(days=>g.echeance_jours)
   and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis')
   and u.email_confirmed_at is not null and split_part(lower(u.email),'@',2)=lower(a.domaine)
   and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id)))
  union all
  select d.id,d.agence_id,'epuise',m.utilisateur_id,d.revision_rappel,d.expire_le,lower(u.email),
   d.id::text||'/epuise/'||m.utilisateur_id::text||'/'||d.revision_rappel::text
  from public.dossiers d join public.agences a on a.id=d.agence_id and a.statut='verifiee'
  join public.reglages_rappels g on g.agence_id=a.id
  join public.membres_agence m on m.agence_id=d.agence_id join auth.users u on u.id=m.utilisateur_id
  left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
  where not d.demonstration and g.relance_jours>0 and d.expire_le>clock_timestamp()
   and d.statut in ('ouvert','depot_en_cours')
   and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>g.relance_jours)
   and (select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot'
     and r.cree_le>coalesce(d.relances_depuis,'-infinity') and exists(select 1 from public.courriels_sortants c where c.rappel_id=r.id))>=3
   and not exists(select 1 from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot'
     and r.cree_le>clock_timestamp()-make_interval(days=>g.relance_jours))
   and d.activite_rappel_le<=(select max(r.cree_le) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot')
   and u.email_confirmed_at is not null and split_part(lower(u.email),'@',2)=lower(a.domaine)
   and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id)))
 ), cles as (
  select c.*,encode(sha256(convert_to(identite,'UTF8')),'hex') cle from candidats c
 ), inedits as (
  select c.*,row_number() over(partition by agence_id order by expire_le,dossier_id,nature,membre_id) rang,
   (select count(*) from public.rappels_dossiers r where r.agence_id=c.agence_id and r.cree_le>=clock_timestamp()-interval '1 day') deja
  from cles c where not exists(select 1 from public.rappels_dossiers r where r.cle=c.cle)
 )
 insert into public.rappels_dossiers(cle,dossier_id,agence_id,nature,membre_id,revision_dossier,empreinte_email,expiration_dossier,expire_le)
 select cle,dossier_id,agence_id,nature,membre_id,revision_rappel,encode(sha256(convert_to(email,'UTF8')),'hex'),expire_le,least(expire_le,clock_timestamp()+interval '1 day')
 from inedits where rang+deja<=50 order by expire_le,dossier_id,nature,membre_id limit least(20,200-total)
 on conflict(cle) do nothing;
 get diagnostics ajoutes=row_count;
 return ajoutes;
end;$$;

revoke all on function public.programmer_rappels() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.programmer_rappels() to serveur;
notify pgrst,'reload schema';
