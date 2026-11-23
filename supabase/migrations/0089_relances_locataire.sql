-- Relancer aussi le locataire, pas seulement le garant.
--
-- Les relances automatiques (0052) ne parlaient qu'au garant. Or un dossier
-- peut attendre le locataire lui-meme : il ne l'a pas regle, il n'a pas
-- designe son garant, ou il n'a pas declare son loyer. Rien ne partait alors,
-- et le dossier s'eteignait a son echeance sans que personne ne l'ait dit.
--
-- Une nouvelle nature de rappel, `locataire`, porte le motif de l'attente :
--   paiement  le dossier reste a regler (`dossier_a_regler`, 0085) ;
--   garant    aucun garant n'est designe ;
--   loyer     le loyer n'est pas declare.
-- Un seul motif vaut a la fois, dans cet ordre, qui est celui du parcours.
--
-- Regles, sur le modele des relances du garant :
--   - dossier rattache a une agence : le reglage « relance » de l'agence
--     s'applique (desactive par defaut, 3, 7 ou 14 jours sans activite) ;
--   - dossier sans agence : trois jours sans activite, sans reglage, comme
--     l'annonce de fin de dossier (0085) ;
--   - trois relances au plus par dossier et par motif, trois jours au moins
--     entre deux relances du locataire ;
--   - les plafonds de programmation restent ceux de la 0052 : 20 par passage,
--     50 par agence et 200 au total sur 24 heures. Les dossiers sans agence
--     partagent un meme plafond de 50, pour ne jamais affamer les agences ;
--   - demonstration, echeance passee, agence non verifiee, dossier d'un
--     second garant (0067) et statuts de fin interdisent la relance ;
--   - le rappel est reverifie avant preparation, prise de bail et envoi : un
--     paiement, une designation ou un loyer declare l'annule.
-- Aucun lien de capacite n'est cree ni prolonge : le courriel renvoie le
-- locataire a son lien habituel.
--
-- Le paiement et le loyer comptent desormais comme une activite du dossier.
-- Les dossiers qui attendent deja leur locataire repartent d'aujourd'hui :
-- pas de rattrapage massif a l'application de la migration.
--
-- `rappels_a_preparer` garde son contrat et ignore la nouvelle nature : le
-- code deja deploye ne la connait pas. Le nouveau code lit en plus
-- `rappels_locataire_a_preparer`.

alter table public.rappels_dossiers alter column agence_id drop not null,
 add column motif text,
 drop constraint rappels_dossiers_nature_check,
 add constraint rappels_dossiers_nature_check check(nature in ('depot','echeance','epuise','locataire')),
 add constraint rappels_dossiers_motif_check check(
  (nature='locataire' and membre_id is null and motif in ('paiement','garant','loyer'))
  or (nature<>'locataire' and motif is null and agence_id is not null));

-- Ce que le dossier attend de son locataire, ou null s'il n'attend rien de lui.
create function public.motif_relance_locataire(le_dossier uuid)
returns text language sql stable security definer set search_path='' as $$
 select case
  when d.demonstration or d.dossier_principal is not null or d.expire_le<=clock_timestamp() then null
  when d.statut in ('ouvert','depot_en_cours') and public.dossier_a_regler(d.id) then 'paiement'
  when d.statut in ('ouvert','depot_en_cours') and d.email_garant is null then 'garant'
  when d.statut in ('ouvert','depot_en_cours','complet') and d.loyer_cents is null then 'loyer'
 end
 from public.dossiers d where d.id=le_dossier;
$$;
revoke all on function public.motif_relance_locataire(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Le paiement et le loyer sont une activite : ils reportent les relances et
-- rendent obsolete un rappel encore en file.
create or replace function public.actualiser_activite_rappel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='dossiers' then
  if new.statut is distinct from old.statut or new.email_garant is distinct from old.email_garant
   or new.agence_id is distinct from old.agence_id or new.paye_le is distinct from old.paye_le
   or new.loyer_cents is distinct from old.loyer_cents then
   new.activite_rappel_le:=clock_timestamp();new.revision_rappel:=gen_random_uuid();
  end if;
  return new;
 end if;
 update public.dossiers set activite_rappel_le=clock_timestamp(),revision_rappel=gen_random_uuid()
 where id=case when tg_op='DELETE' then old.dossier_id else new.dossier_id end;
 return null;
end;$$;

-- Pas de rattrapage : les dossiers en attente du locataire repartent d'aujourd'hui.
update public.dossiers d set activite_rappel_le=clock_timestamp()
 where public.motif_relance_locataire(d.id) is not null;

create or replace function public.rappel_encore_valide(identifiant uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from public.rappels_dossiers r
 join public.dossiers d on d.id=r.dossier_id and d.agence_id is not distinct from r.agence_id
 left join public.agences a on a.id=d.agence_id and a.statut='verifiee'
 left join public.reglages_rappels g on g.agence_id=a.id
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
   and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id)))))
 or (r.nature='locataire' and d.revision_rappel=r.revision_dossier
  and (d.agence_id is null or coalesce(g.relance_jours,0)>0)
  and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>case when d.agence_id is null then 3 else g.relance_jours end)
  and r.motif=public.motif_relance_locataire(d.id)
  and r.empreinte_email=encode(sha256(convert_to(lower(d.email_locataire::text),'UTF8')),'hex')));
$$;

create or replace function public.programmer_rappels() returns integer
language plpgsql security definer set search_path='' as $$
declare total integer;ajoutes integer;
begin
 perform pg_advisory_xact_lock(525200,1);
 select count(*) into total from public.rappels_dossiers where cree_le>=clock_timestamp()-interval '1 day';
 if total>=200 then return 0;end if;
 with candidats as (
  select d.id dossier_id,d.agence_id,'depot'::text nature,null::text motif,null::uuid membre_id,d.revision_rappel,d.expire_le,lower(d.email_garant) email,
   d.id::text||'/depot/'||d.revision_rappel::text||'/'||(1+(select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot' and r.cree_le>coalesce(d.relances_depuis,'-infinity')))::text identite
  from public.dossiers d join public.agences a on a.id=d.agence_id and a.statut='verifiee'
  join public.reglages_rappels g on g.agence_id=a.id
  where not d.demonstration and d.expire_le>clock_timestamp() and d.email_garant is not null and g.relance_jours>0
   and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>g.relance_jours)
   and (d.statut in ('ouvert','depot_en_cours') or (d.statut in ('complet','garant_insuffisant') and exists(select 1 from public.complements_documentaires c where c.dossier_id=d.id and c.etat='demande')))
   and (select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot' and r.cree_le>coalesce(d.relances_depuis,'-infinity'))<3
   and not exists(select 1 from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='depot' and r.cree_le>clock_timestamp()-interval '3 days')
  union all
  select d.id,d.agence_id,'echeance',null,m.utilisateur_id,d.revision_rappel,d.expire_le,lower(u.email),
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
  select d.id,d.agence_id,'epuise',null,m.utilisateur_id,d.revision_rappel,d.expire_le,lower(u.email),
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
  union all
  select d.id,d.agence_id,'locataire',x.motif,null,d.revision_rappel,d.expire_le,lower(d.email_locataire::text),
   d.id::text||'/locataire/'||x.motif||'/'||d.revision_rappel::text||'/'||(1+(select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='locataire' and r.motif=x.motif))::text
  from public.dossiers d
  left join public.agences a on a.id=d.agence_id and a.statut='verifiee'
  left join public.reglages_rappels g on g.agence_id=a.id
  cross join lateral (select public.motif_relance_locataire(d.id) motif) x
  where not d.demonstration and d.expire_le>clock_timestamp() and d.dossier_principal is null
   and d.statut in ('ouvert','depot_en_cours','complet')
   and (d.agence_id is null or coalesce(g.relance_jours,0)>0)
   and d.activite_rappel_le<=clock_timestamp()-make_interval(days=>case when d.agence_id is null then 3 else g.relance_jours end)
   and x.motif is not null
   and (select count(*) from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='locataire' and r.motif=x.motif)<3
   and not exists(select 1 from public.rappels_dossiers r where r.dossier_id=d.id and r.nature='locataire' and r.cree_le>clock_timestamp()-interval '3 days')
 ), cles as (
  select c.*,encode(sha256(convert_to(identite,'UTF8')),'hex') cle from candidats c
 ), inedits as (
  select c.*,row_number() over(partition by agence_id order by expire_le,dossier_id,nature,membre_id) rang,
   (select count(*) from public.rappels_dossiers r where r.agence_id is not distinct from c.agence_id and r.cree_le>=clock_timestamp()-interval '1 day') deja
  from cles c where not exists(select 1 from public.rappels_dossiers r where r.cle=c.cle)
 )
 insert into public.rappels_dossiers(cle,dossier_id,agence_id,nature,motif,membre_id,revision_dossier,empreinte_email,expiration_dossier,expire_le)
 select cle,dossier_id,agence_id,nature,motif,membre_id,revision_rappel,encode(sha256(convert_to(email,'UTF8')),'hex'),expire_le,least(expire_le,clock_timestamp()+interval '1 day')
 from inedits where rang+deja<=50 order by expire_le,dossier_id,nature,membre_id limit least(20,200-total)
 on conflict(cle) do nothing;
 get diagnostics ajoutes=row_count;
 return ajoutes;
end;$$;

-- Le contrat lu par le code deja deploye : sans la nouvelle nature.
create or replace function public.rappels_a_preparer()
returns table(id uuid,dossier_id uuid,reference text,nature text,email text,expiration timestamptz)
language sql security definer set search_path='' as $$
 select r.id,d.id,d.reference,r.nature,case when r.nature='depot' then d.email_garant else u.email end,d.expire_le
 from public.rappels_dossiers r join public.dossiers d on d.id=r.dossier_id left join auth.users u on u.id=r.membre_id
 where r.nature<>'locataire' and public.rappel_encore_valide(r.id) and not exists(select 1 from public.courriels_sortants c where c.id=r.id)
 order by r.cree_le,r.id limit 20;
$$;

create function public.rappels_locataire_a_preparer()
returns table(id uuid,dossier_id uuid,reference text,motif text,email text,expiration timestamptz)
language sql security definer set search_path='' as $$
 select r.id,d.id,d.reference,r.motif,d.email_locataire::text,d.expire_le
 from public.rappels_dossiers r join public.dossiers d on d.id=r.dossier_id
 where r.nature='locataire' and public.rappel_encore_valide(r.id) and not exists(select 1 from public.courriels_sortants c where c.id=r.id)
 order by r.cree_le,r.id limit 20;
$$;

revoke all on function public.rappel_encore_valide(uuid),public.programmer_rappels(),public.rappels_a_preparer(),
 public.rappels_locataire_a_preparer(),public.actualiser_activite_rappel()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.programmer_rappels(),public.rappels_a_preparer(),public.rappels_locataire_a_preparer() to serveur;
notify pgrst,'reload schema';
