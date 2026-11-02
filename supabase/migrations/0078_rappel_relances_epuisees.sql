-- Prevenir l'agence quand les relances automatiques sont epuisees.
--
-- Apres trois relances de depot (0052), plus rien ne part et le dossier
-- attend en silence ; la carte du pilotage (0077) le montre a qui ouvre
-- l'espace. Ce rappel le dit par courriel aux collaborateurs, avec les memes
-- regles que les rappels d'echeance : domaine de l'agence, adresse confirmee,
-- preferences de notification (tous, mes dossiers, aucun). Il part une fois
-- le delai de relance de l'agence ecoule apres la troisieme relance, sans
-- activite depuis, et une seule fois par collaborateur tant que le dossier ne
-- bouge pas : la cle porte la revision du dossier, et toute activite annule
-- un rappel encore en file. Le courriel ne contient ni l'adresse du garant
-- ni aucune piece.

alter table public.rappels_dossiers drop constraint rappels_dossiers_nature_check,
 add constraint rappels_dossiers_nature_check check(nature in ('depot','echeance','epuise'));

create or replace function public.rappel_encore_valide(identifiant uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from public.rappels_dossiers r
 join public.dossiers d on d.id=r.dossier_id and d.agence_id=r.agence_id
 join public.agences a on a.id=d.agence_id and a.statut='verifiee'
 join public.reglages_rappels g on g.agence_id=a.id
 where r.id=identifiant and not d.demonstration and d.expire_le>clock_timestamp()
 and r.expire_le>clock_timestamp() and r.expiration_dossier=d.expire_le
 and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis')
 and ((r.nature='depot' and g.relance_jours>0 and d.email_garant is not null
  and d.revision_rappel=r.revision_dossier and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>g.relance_jours)
  and (d.statut in ('ouvert','depot_en_cours') or (d.statut in ('complet','garant_insuffisant') and exists(select 1 from public.complements_documentaires c where c.dossier_id=d.id and c.etat='demande')))
  and r.empreinte_email=encode(sha256(convert_to(lower(d.email_garant),'UTF8')),'hex'))
 or (r.nature='echeance' and g.echeance_jours>0 and d.expire_le<=clock_timestamp()+make_interval(days=>g.echeance_jours)
  and exists(select 1 from public.membres_agence m join auth.users u on u.id=m.utilisateur_id
   left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
   where m.utilisateur_id=r.membre_id and m.agence_id=d.agence_id and u.email_confirmed_at is not null
   and split_part(lower(u.email),'@',2)=lower(a.domaine)
   and r.empreinte_email=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex')
   and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id))))))
 or (r.nature='epuise' and g.relance_jours>0 and d.statut in ('ouvert','depot_en_cours')
  and d.revision_rappel=r.revision_dossier
  and exists(select 1 from public.membres_agence m join auth.users u on u.id=m.utilisateur_id
   left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
   where m.utilisateur_id=r.membre_id and m.agence_id=d.agence_id and u.email_confirmed_at is not null
   and split_part(lower(u.email),'@',2)=lower(a.domaine)
   and r.empreinte_email=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex')
   and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id))))));
$$;

create or replace function public.programmer_rappels() returns integer
language plpgsql security definer set search_path='' as $$
declare total integer;ajoutes integer;
begin
 perform pg_advisory_xact_lock(525200,1);
 select count(*) into total from public.rappels_dossiers where cree_le>=clock_timestamp()-interval '1 day';
 if total>=200 then return 0;end if;
 with candidats as (
  select d.id dossier_id,d.agence_id,'depot'::text nature,null::uuid membre_id,d.revision_rappel,d.expire_le,lower(d.email_garant) email,
   d.id::text||'/depot/'||d.revision_rappel::text||'/'||(1+(select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot'))::text identite
  from public.dossiers d join public.agences a on a.id=d.agence_id and a.statut='verifiee'
  join public.reglages_rappels g on g.agence_id=a.id
  where not d.demonstration and d.expire_le>clock_timestamp() and d.email_garant is not null and g.relance_jours>0
   and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>g.relance_jours)
   and (d.statut in ('ouvert','depot_en_cours') or (d.statut in ('complet','garant_insuffisant') and exists(select 1 from public.complements_documentaires c where c.dossier_id=d.id and c.etat='demande')))
   and (select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot')<3
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
     and exists(select 1 from public.courriels_sortants c where c.rappel_id=r.id))>=3
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

revoke all on function public.rappel_encore_valide(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
revoke all on function public.programmer_rappels() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.programmer_rappels() to serveur;
notify pgrst,'reload schema';
