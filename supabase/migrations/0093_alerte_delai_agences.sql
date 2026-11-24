-- Alerter l'exploitant avant que les 48 heures ouvrees promises soient perdues.
--
-- Le site promet deux fois « sous 48 heures ouvrees » a une agence :
--   demande      le formulaire de demonstration de /agences (`demandes_agence`,
--                0001), tant que son statut reste `nouvelle` ;
--   activation   la demande d'activation de l'espace (`activation_demandee_le`,
--                0014), tant que l'agence reste en `decouverte`.
-- Un courriel part a l'arrivee de chaque demande, puis plus rien : une demande
-- oubliee restait oubliee, et la promesse tombait sans que personne le voie.
--
-- Deux paliers par demande, chacun une seule fois :
--   proche    un jour ouvre est passe, il en reste un pour tenir le delai ;
--   depasse   les deux jours ouvres sont passes sans reponse.
-- Les jours ouvres vont du lundi au vendredi, heure de Paris. Les jours feries
-- comptent comme ouvres : l'alerte part alors un jour trop tot, jamais trop
-- tard. Une demande recue le week-end part du lundi a minuit.
--
-- « Repondre » reste un geste manuel, depuis le tableau de bord : passer la
-- demande a `contactee`, ou verifier l'agence. C'est ce geste qui eteint
-- l'alerte. Une activation redemandee porte une nouvelle date et rearme ses
-- deux paliers.
--
-- Le registre ne garde que des identifiants et des dates. Sur le modele de
-- l'annonce de fin de dossier (0085), la maintenance lit ce qui est du, met le
-- courriel en file sous une cle stable, puis acquitte : un passage interrompu
-- se rejoue sans doublon.
--
-- Pas de rattrapage : les demandes deja hors delai a l'application de cette
-- migration sont inscrites comme alertees. Celles qui courent encore suivent
-- la regle.

-- L'instant ou `jours` jours ouvres se sont ecoules depuis `depuis`.
create function public.echeance_ouvree(depuis timestamptz,jours integer)
returns timestamptz language plpgsql stable set search_path='' as $$
declare t timestamp:=depuis at time zone 'Europe/Paris';restant integer:=jours;
begin
 if extract(isodow from t)>=6 then
  t:=date_trunc('day',t)+make_interval(days=>8-extract(isodow from t)::integer);
 end if;
 while restant>0 loop
  t:=t+interval '1 day';
  if extract(isodow from t)<6 then restant:=restant-1;end if;
 end loop;
 return t at time zone 'Europe/Paris';
end;$$;

create table public.alertes_delai_agence (
 nature text not null check(nature in ('demande','activation')),
 objet uuid not null,
 depuis timestamptz not null,
 palier text not null check(palier in ('proche','depasse')),
 cree_le timestamptz not null default clock_timestamp(),
 primary key(nature,objet,depuis,palier)
);
comment on table public.alertes_delai_agence is
 'Alertes deja envoyees a l''exploitant sur le delai de 48 heures ouvrees promis aux agences. Identifiants et dates seulement.';
alter table public.alertes_delai_agence enable row level security;
revoke all on public.alertes_delai_agence
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Les demandes encore sans reponse, avec la date qui fait courir le delai.
create function public.demandes_agence_en_attente()
returns table(nature text,objet uuid,depuis timestamptz,nom text,contact text)
language sql stable security definer set search_path='' as $$
 select 'demande'::text,d.id,d.cree_le,d.nom_agence,d.email
 from public.demandes_agence d where d.statut='nouvelle'
 union all
 select 'activation',a.id,a.activation_demandee_le,a.nom,a.domaine
 from public.agences a where a.statut='decouverte' and a.activation_demandee_le is not null;
$$;

-- Pas de rattrapage : ce qui est deja hors delai aujourd'hui ne sonne pas.
insert into public.alertes_delai_agence(nature,objet,depuis,palier)
select e.nature,e.objet,e.depuis,'depasse' from public.demandes_agence_en_attente() e
where public.echeance_ouvree(e.depuis,2)<=clock_timestamp();

-- Ce qui est du et pas encore alerte, le palier le plus avance seulement :
-- une demande deja hors delai ne recoit pas en plus l'alerte « proche ».
create function public.delais_agence_a_alerter()
returns table(nature text,objet uuid,depuis timestamptz,palier text,nom text,contact text,echeance timestamptz)
language sql stable security definer set search_path='' as $$
 with dues as (
  select e.*,public.echeance_ouvree(e.depuis,2) echeance,
   case when public.echeance_ouvree(e.depuis,2)<=clock_timestamp() then 'depasse'
        when public.echeance_ouvree(e.depuis,1)<=clock_timestamp() then 'proche' end palier
  from public.demandes_agence_en_attente() e
 )
 select u.nature,u.objet,u.depuis,u.palier,u.nom,u.contact,u.echeance from dues u
 where u.palier is not null
  and not exists(select 1 from public.alertes_delai_agence x
   where x.nature=u.nature and x.objet=u.objet and x.depuis=u.depuis and x.palier in (u.palier,'depasse'))
 order by u.echeance,u.objet limit 20;
$$;

-- Acquitte l'alerte une fois son courriel en file. La date attendue protege
-- d'une activation redemandee entre la lecture et l'acquittement : la nouvelle
-- demande garde ses deux paliers. Le registre s'allege au passage.
create function public.acquitter_alerte_delai(la_nature text,l_objet uuid,le_depart timestamptz,le_palier text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 delete from public.alertes_delai_agence where cree_le<clock_timestamp()-interval '12 months';
 insert into public.alertes_delai_agence(nature,objet,depuis,palier)
 select e.nature,e.objet,e.depuis,le_palier from public.demandes_agence_en_attente() e
 where e.nature=la_nature and e.objet=l_objet and e.depuis=le_depart and le_palier in ('proche','depasse')
 on conflict do nothing;
 return found;
end;$$;

revoke all on function public.echeance_ouvree(timestamptz,integer),public.demandes_agence_en_attente(),
 public.delais_agence_a_alerter(),public.acquitter_alerte_delai(text,uuid,timestamptz,text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.delais_agence_a_alerter(),
 public.acquitter_alerte_delai(text,uuid,timestamptz,text) to serveur;
notify pgrst,'reload schema';
