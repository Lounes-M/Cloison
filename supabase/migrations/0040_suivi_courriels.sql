-- Suivi minimal fournisseur, sans adresse, sujet, lien ou corps de webhook.
alter table public.courriels_sortants
 add column fournisseur_id text unique check(fournisseur_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 add column etat_livraison text check(etat_livraison in ('accepte','retarde','livre','rejete','plainte')),
 add column evenement_le timestamptz;
create table public.evenements_courriels (
 id text primary key check(id ~ '^[A-Za-z0-9_-]{1,128}$'),
 courriel_id uuid not null references public.courriels_sortants(id) on delete cascade,
 fournisseur_id text not null,
 type text not null check(type in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.failed','email.complained','email.suppressed')),
 survenu_le timestamptz not null,
 recu_le timestamptz not null default now()
);
create index evenements_courriels_message on public.evenements_courriels(courriel_id);
alter table public.evenements_courriels enable row level security;
revoke all on public.evenements_courriels from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create function public.acquitter_courriel(identifiant uuid,le_bail uuid,reference_fournisseur text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.courriels_sortants;
begin
 if reference_fournisseur is not null and reference_fournisseur !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'Reference fournisseur invalide'; end if;
 select * into c from public.courriels_sortants where id=identifiant for update;
 if not found then return false; end if;
 -- Un webhook signe peut avoir confirme ce meme envoi avant sa reponse HTTP.
 if c.envoye_le is not null then return coalesce(reference_fournisseur is not null and c.fournisseur_id=reference_fournisseur,false); end if;
 if le_bail is null or c.bail is distinct from le_bail then return false; end if;
 if reference_fournisseur is not null and c.fournisseur_id is not null and c.fournisseur_id<>reference_fournisseur then raise exception 'Reference fournisseur differente'; end if;
 update public.courriels_sortants set
  fournisseur_id=coalesce(reference_fournisseur,fournisseur_id),
  envoye_le=case when reference_fournisseur is not null then now() else null end,
  contenu=case when reference_fournisseur is not null then null else contenu end,
  etat_livraison=case when reference_fournisseur is not null then coalesce(etat_livraison,'accepte') else etat_livraison end,
  a_reconcilier=case when reference_fournisseur is not null then false else a_reconcilier end,
  bail=null,bail_expire_le=null,prochain_essai=now()+interval '5 minutes'
 where id=identifiant;
 return true;
end $$;

create function public.enregistrer_evenement_courriel(evenement text,reference_fournisseur text,identifiant uuid,nature text,survenu timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.courriels_sortants; precedent public.evenements_courriels; etat text; rang integer; rang_actuel integer;
begin
 if evenement is null or evenement !~ '^[A-Za-z0-9_-]{1,128}$' or reference_fournisseur is null or reference_fournisseur !~ '^[A-Za-z0-9_-]{1,128}$'
 or nature is null or nature not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.failed','email.complained','email.suppressed')
 or survenu is null or survenu>now()+interval '5 minutes' or survenu<now()-interval '90 days' then raise exception 'Evenement fournisseur invalide'; end if;
 select * into c from public.courriels_sortants where
  (identifiant is not null and id=identifiant) or (identifiant is null and fournisseur_id=reference_fournisseur) for update;
 if not found then return false; end if;
 if c.fournisseur_id is not null and c.fournisseur_id<>reference_fournisseur then raise exception 'Reference fournisseur differente'; end if;
 select * into precedent from public.evenements_courriels where id=evenement;
 if found then
  if precedent.courriel_id<>c.id or precedent.fournisseur_id<>reference_fournisseur or precedent.type<>nature or precedent.survenu_le<>survenu then raise exception 'Evenement fournisseur different'; end if;
  return true;
 end if;
 etat:=case nature when 'email.sent' then 'accepte' when 'email.delivery_delayed' then 'retarde' when 'email.delivered' then 'livre' when 'email.complained' then 'plainte' else 'rejete' end;
 rang:=case etat when 'accepte' then 0 when 'retarde' then 1 when 'livre' then 2 when 'rejete' then 3 else 4 end;
 rang_actuel:=case c.etat_livraison when 'accepte' then 0 when 'retarde' then 1 when 'livre' then 2 when 'rejete' then 3 when 'plainte' then 4 else -1 end;
 insert into public.evenements_courriels(id,courriel_id,fournisseur_id,type,survenu_le) values(evenement,c.id,reference_fournisseur,nature,survenu);
 update public.courriels_sortants set fournisseur_id=reference_fournisseur,
  envoye_le=coalesce(envoye_le,now()),contenu=null,a_reconcilier=false,bail=null,bail_expire_le=null,
  etat_livraison=case when rang>=rang_actuel then etat else etat_livraison end,
  evenement_le=greatest(evenement_le,survenu)
 where id=c.id;
 return true;
end $$;
revoke all on function public.acquitter_courriel(uuid,uuid,text),public.enregistrer_evenement_courriel(text,text,uuid,text,timestamptz) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.acquitter_courriel(uuid,uuid,text),public.enregistrer_evenement_courriel(text,text,uuid,text,timestamptz) to serveur;
create or replace function public.etat_file_courriels()
returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
  delete from public.courriels_sortants where id in (select id from public.courriels_sortants where cree_le < now()-interval '90 days' order by cree_le limit 5000);
  update public.courriels_sortants set contenu=null,annule_le=now(),a_reconcilier=false
   where envoye_le is null and annule_le is null and expire_le <= now();
  -- Un lien de capacite expire en sept jours. Ne pas conserver son courriel
  -- indefiniment, meme lorsque l'operateur n'a pas encore reconcilie l'envoi.
  update public.courriels_sortants set contenu=null,a_reconcilier=true
    where envoye_le is null and cree_le < now()-interval '7 days' and contenu is not null;
  select count(*) into n from public.courriels_sortants where a_reconcilier and annule_le is null;
  return n;
end;
$$;
revoke all on function public.etat_file_courriels() from public,anon,authenticated,porteur_lien;
grant execute on function public.etat_file_courriels() to serveur;


create or replace function public.rapport_exploitation()
returns jsonb language sql stable security definer set search_path='' as $$
with acces_recents as (
  select j.acteur_id,j.dossier_id from public.journal_acces j
  join public.dossiers d on d.id=j.dossier_id
  where j.acteur='agence' and j.action='piece_ouverte' and not d.demonstration
    and j.quand >= now()-interval '1 hour' and j.quand <= now()
), cohortes as (
  select d.id,d.agence_id,(d.email_garant is not null) as garant_designe,d.statut
  from public.dossiers d where not d.demonstration
    and d.cree_le >= now()-interval '28 days' and d.cree_le <= now()
)
select jsonb_build_object(
  'version',1,
  'alertes',jsonb_build_object(
    'collaborateurs_acces_intensifs',(select count(*) from (select acteur_id from acces_recents where acteur_id is not null group by acteur_id having count(*) >= 100) x),
    'dossiers_acces_intensifs',(select count(*) from (select dossier_id from acces_recents group by dossier_id having count(*) >= 50) x),
    'purges_en_retard',(select count(*) from public.objets_a_supprimer where cree_le <= now()-interval '1 hour'),
    'courriels_a_reconcilier',(select count(*) from public.courriels_sortants where envoye_le is null and annule_le is null and (a_reconcilier or premier_essai <= now()-interval '23 hours' or cree_le <= now()-interval '1 hour'))+(select count(*) from public.livraisons_liens where cree_le <= now()-interval '1 hour' and expire_le > now())+(select count(*) from public.courriels_sortants where annule_le is null and (etat_livraison in ('rejete','plainte') or (etat_livraison='retarde' and envoye_le <= now()-interval '1 hour')))+(select count(*) from public.notifications_statut n join public.dossiers d on d.id=n.dossier_id where n.cree_le <= now()-interval '1 hour' and d.expire_le > now())
  ),
  'pilote',jsonb_build_object(
    'jours',28,
    'dossiers_presents',(select count(*) from cohortes),
    'avec_agence',(select count(*) from cohortes where agence_id is not null),
    'garant_designe',(select count(*) from cohortes where garant_designe),
    'avec_piece_presente',(select count(*) from cohortes c where exists(select 1 from public.pieces p where p.dossier_id=c.id)),
    'complets_ou_transmis',(select count(*) from cohortes where statut in ('complet','transmis','signe')),
    'marques_signes',(select count(*) from cohortes where statut='signe')
  )
);
$$;
revoke all on function public.rapport_exploitation() from public,anon,authenticated,porteur_lien;
grant execute on function public.rapport_exploitation() to serveur;


