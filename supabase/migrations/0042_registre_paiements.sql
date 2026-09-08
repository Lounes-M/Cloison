do $historique$ begin
 if exists(select 1 from public.dossiers where paye_le is not null and paiement_ref !~ '^cs_[A-Za-z0-9_]{1,196}$') then raise exception 'References de paiement historiques a examiner'; end if;
end $historique$;
-- Historique financier minimal, sans adresse, contenu, jeton ou donnee de carte.
create table public.tarifs_paiement (
 version text primary key check (version ~ '^[a-z0-9-]{1,64}$'),
 montant_cents integer not null check (montant_cents between 1 and 100000000),
 devise text not null check (devise ~ '^[a-z]{3}$'),
 cree_le timestamptz not null default now()
);
insert into public.tarifs_paiement(version,montant_cents,devise) values ('locataire-2026-09-04',900,'eur');
alter table public.tarifs_paiement enable row level security;
revoke all on public.tarifs_paiement from public,anon,authenticated,porteur_lien,serveur,depot_piece;

alter table public.sessions_paiement add column tarif_version text not null default 'locataire-2026-09-04' references public.tarifs_paiement(version);

create table public.registre_paiements (
 reference_session text primary key check (reference_session ~ '^cs_[A-Za-z0-9_]{1,196}$'),
 reference_paiement text check (reference_paiement ~ '^pi_[A-Za-z0-9_]{1,196}$'),
 dossier_id uuid references public.dossiers(id) on delete set null,
 source_dossier uuid not null,
 montant_cents integer not null check (montant_cents between 1 and 100000000),
 devise text not null check (devise ~ '^[a-z]{3}$'),
 tarif_version text not null check (char_length(tarif_version) between 1 and 64),
 marque boolean not null default false,
 anomalie boolean not null default false,
 recu_le timestamptz not null default now(),
 survenu_le timestamptz not null
);
alter table public.registre_paiements add column origine text not null default 'evenement' check (origine in ('evenement','historique'));
alter table public.registre_paiements add column paye_fournisseur boolean default true;
create index registre_paiements_reference on public.registre_paiements(reference_paiement);
alter table public.registre_paiements enable row level security;
revoke all on public.registre_paiements from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create table public.evenements_paiements (
 id text primary key check (id ~ '^evt_[A-Za-z0-9_]{1,195}$'),
 nature text not null check (nature in ('paiement','remboursement','litige')),
 reference_objet text not null check (reference_objet ~ '^[A-Za-z0-9_]{1,200}$'),
 reference_paiement text check (reference_paiement ~ '^pi_[A-Za-z0-9_]{1,196}$'),
 source_dossier uuid,
 montant_cents integer not null check (montant_cents between 0 and 100000000),
 devise text not null check (devise ~ '^[a-z]{3}$'),
 tarif_version text,
 etat text,
 survenu_le timestamptz not null,
 recu_le timestamptz not null default now(),
 anomalie boolean not null default false
);
alter table public.evenements_paiements add column reference_session text;
create index evenements_paiements_reference on public.evenements_paiements(reference_paiement,nature,survenu_le desc);
alter table public.evenements_paiements enable row level security;
revoke all on public.evenements_paiements from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create function public.enregistrer_paiement_locataire(evenement text,reference_session text,reference_paiement text,le_dossier uuid,montant integer,devise text,version_tarif text,survenu timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare precedent public.evenements_paiements; regle public.registre_paiements; tarif public.tarifs_paiement; session public.sessions_paiement; dossier_present uuid; confirme boolean:=false; anomalie boolean:=false;
begin
 if evenement is null or evenement !~ '^evt_[A-Za-z0-9_]{1,195}$' or reference_session is null or reference_session !~ '^cs_[A-Za-z0-9_]{1,196}$'
 or (reference_paiement is not null and reference_paiement !~ '^pi_[A-Za-z0-9_]{1,196}$')
 or le_dossier is null or montant is null or montant not between 1 and 100000000 or devise is null or devise !~ '^[a-z]{3}$'
 or version_tarif is null or version_tarif !~ '^[a-z0-9-]{1,64}$' or survenu is null or survenu>now()+interval '5 minutes' then raise exception 'Evenement financier invalide'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('evenement:'||evenement,0));
 select * into precedent from public.evenements_paiements e where e.id=evenement;
 if found then
  anomalie:=precedent.nature<>'paiement' or precedent.reference_objet<>reference_session or precedent.reference_paiement is distinct from reference_paiement or precedent.source_dossier is distinct from le_dossier or precedent.montant_cents<>montant or precedent.devise<>devise or precedent.tarif_version is distinct from version_tarif or precedent.survenu_le<>survenu;
  if anomalie then update public.evenements_paiements e set anomalie=true where e.id=evenement; end if;
  select * into regle from public.registre_paiements r where r.reference_session=reference_session;
  return jsonb_build_object('marque',coalesce(regle.marque,false) and not anomalie,'anomalie',anomalie or precedent.anomalie or coalesce(regle.anomalie,false));
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('paiement:'||coalesce(reference_paiement,reference_session),0));
 select d.id into dossier_present from public.dossiers d where d.id=le_dossier for update;
 select * into regle from public.registre_paiements r where r.reference_session=reference_session;
 if found then
  anomalie:=regle.source_dossier<>le_dossier or regle.reference_paiement is distinct from reference_paiement or regle.montant_cents<>montant or regle.devise<>devise or regle.tarif_version<>version_tarif;
  confirme:=regle.marque and not anomalie;
  anomalie:=anomalie or regle.anomalie;
 else
  select * into tarif from public.tarifs_paiement t where t.version=version_tarif;
  anomalie:=not found or tarif.montant_cents is distinct from montant or tarif.devise is distinct from devise;
  select * into session from public.sessions_paiement s where s.dossier_id=le_dossier;
  if found and (session.tarif_version<>version_tarif or (session.session_ref is not null and session.session_ref<>reference_session)) then anomalie:=true; end if;
  if reference_paiement is not null and exists(select 1 from public.registre_paiements r where r.reference_paiement=reference_paiement and r.reference_session<>reference_session) then anomalie:=true; end if;
  if not anomalie then
   begin confirme:=public.marquer_dossier_paye(le_dossier,reference_session);
   exception when unique_violation then anomalie:=true; confirme:=false; end;
  end if;
  insert into public.registre_paiements(reference_session,reference_paiement,dossier_id,source_dossier,montant_cents,devise,tarif_version,marque,anomalie,survenu_le)
  values(reference_session,reference_paiement,dossier_present,le_dossier,montant,devise,version_tarif,confirme,anomalie,survenu);
 end if;
 insert into public.evenements_paiements(id,nature,reference_objet,reference_paiement,source_dossier,montant_cents,devise,tarif_version,survenu_le,anomalie)
 values(evenement,'paiement',reference_session,reference_paiement,le_dossier,montant,devise,version_tarif,survenu,anomalie);
 return jsonb_build_object('marque',confirme,'anomalie',anomalie);
end $$;
revoke all on function public.enregistrer_paiement_locataire(text,text,text,uuid,integer,text,text,timestamptz) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.enregistrer_paiement_locataire(text,text,text,uuid,integer,text,text,timestamptz) to serveur;

create function public.enregistrer_suivi_paiement(evenement text,reference_paiement text,reference_objet text,nature text,montant integer,devise text,etat text,survenu timestamptz,reference_session text default null,le_dossier uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare precedent public.evenements_paiements; different boolean;
begin
 if evenement is null or evenement !~ '^evt_[A-Za-z0-9_]{1,195}$' or reference_paiement is null or reference_paiement !~ '^pi_[A-Za-z0-9_]{1,196}$'
 or reference_objet is null or reference_objet !~ '^[A-Za-z0-9_]{1,200}$' or nature is null or nature not in ('remboursement','litige')
 or montant is null or montant not between 0 and 100000000 or devise is null or devise !~ '^[a-z]{3}$' or etat is null
 or (nature='remboursement' and etat<>'rembourse')
 or (nature='litige' and etat not in ('lost','needs_response','prevented','under_review','warning_closed','warning_needs_response','warning_under_review','won'))
 or survenu is null or survenu>now()+interval '5 minutes' then raise exception 'Suivi financier invalide'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('evenement:'||evenement,0));
 select * into precedent from public.evenements_paiements e where e.id=evenement;
 if found then
  different:=precedent.source_dossier is distinct from le_dossier or precedent.reference_session is distinct from reference_session or precedent.nature<>nature or precedent.reference_objet<>reference_objet or precedent.reference_paiement is distinct from reference_paiement or precedent.montant_cents<>montant or precedent.devise<>devise or precedent.etat is distinct from etat or precedent.survenu_le<>survenu;
  if different then update public.evenements_paiements e set anomalie=true where e.id=evenement; end if;
  return not different;
 end if;
 if reference_session is not null and le_dossier is not null then
  update public.registre_paiements r set reference_paiement=enregistrer_suivi_paiement.reference_paiement where r.reference_session=enregistrer_suivi_paiement.reference_session and r.source_dossier=le_dossier and r.reference_paiement is null;
 end if;
 insert into public.evenements_paiements(id,nature,reference_objet,reference_paiement,source_dossier,reference_session,montant_cents,devise,etat,survenu_le)
 values(evenement,nature,reference_objet,reference_paiement,le_dossier,reference_session,montant,devise,etat,survenu);
 return true;
end $$;
revoke all on function public.enregistrer_suivi_paiement(text,text,text,text,integer,text,text,timestamptz,text,uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.enregistrer_suivi_paiement(text,text,text,text,integer,text,text,timestamptz,text,uuid) to serveur;

-- Les remboursements sont cumulatifs par charge. Un evenement plus ancien ne
-- diminue jamais le total ; un litige ferme ne redevient pas ouvert au rejeu.
create function public.etat_paiements()
returns jsonb language sql stable security definer set search_path='' as $$
with remboursements as (
 select e.reference_paiement,e.reference_objet,max(e.montant_cents) montant
 from public.evenements_paiements e where e.nature='remboursement'
 and exists(select 1 from public.registre_paiements p where p.reference_paiement=e.reference_paiement and p.devise=e.devise)
 group by e.reference_paiement,e.reference_objet
), litiges as (
 select distinct on(e.reference_objet) e.reference_objet,e.etat
 from public.evenements_paiements e where e.nature='litige'
 and exists(select 1 from public.registre_paiements p where p.reference_paiement=e.reference_paiement and p.devise=e.devise)
 order by e.reference_objet,(e.etat in ('lost','won','warning_closed','prevented')) desc,e.survenu_le desc,e.id desc
)
select jsonb_build_object('version',1,
 'paiements', (select count(*) from public.registre_paiements),
 'a_reconcilier',(select count(*) from public.registre_paiements where anomalie or paye_fournisseur is distinct from true or (not marque and origine<>'rapprochement'))+(select count(*) from public.evenements_paiements e where e.anomalie or exists(select 1 from public.registre_paiements p where p.reference_paiement=e.reference_paiement and p.devise<>e.devise) or (e.nature<>'paiement' and e.source_dossier is not null and e.recu_le<now()-interval '1 hour' and not exists(select 1 from public.registre_paiements p where p.reference_paiement=e.reference_paiement)))+(select count(*) from (select r.reference_paiement from remboursements r group by r.reference_paiement having sum(r.montant)>(select max(p.montant_cents) from public.registre_paiements p where p.reference_paiement=r.reference_paiement)) depassements),
 'remboursements',(select count(*) from remboursements where montant>0),
 'rembourse_cents',coalesce((select sum(montant) from remboursements),0),
 'litiges_ouverts',(select count(*) from litiges where etat in ('needs_response','under_review','warning_needs_response','warning_under_review')),
 'litiges_perdus',(select count(*) from litiges where etat='lost'));
$$;
revoke all on function public.etat_paiements() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.etat_paiements() to serveur;

alter table public.tarifs_paiement add constraint tarif_et_montant unique(version,montant_cents,devise);
alter table public.sessions_paiement add column montant_cents integer not null default 900,
 add column devise text not null default 'eur',
 add constraint session_tarif_fixe foreign key(tarif_version,montant_cents,devise) references public.tarifs_paiement(version,montant_cents,devise);
create function public.figer_tarif_session() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.tarif_version,new.montant_cents,new.devise) is distinct from (old.tarif_version,old.montant_cents,old.devise) then raise exception 'Tarif de session immuable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function public.figer_tarif_session() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
create trigger figer_tarif_session before update on public.sessions_paiement for each row execute function public.figer_tarif_session();

insert into public.tarifs_paiement(version,montant_cents,devise) values ('acte-2026-09-04',2900,'eur');
alter table public.factures_actes add column tarif_version text not null default 'acte-2026-09-04' references public.tarifs_paiement(version);


-- Le marquage historique acceptait exclusivement 900 centimes EUR. La provenance
-- reste explicite : cette reprise ne pretend pas disposer de l'evenement Stripe.
insert into public.registre_paiements(reference_session,dossier_id,source_dossier,montant_cents,devise,tarif_version,marque,survenu_le,origine)
select paiement_ref,id,id,900,'eur','locataire-2026-09-04',true,paye_le,'historique' from public.dossiers
where paye_le is not null and paiement_ref ~ '^cs_[A-Za-z0-9_]{1,196}$';

alter table public.registre_paiements drop constraint registre_paiements_origine_check;
alter table public.registre_paiements add constraint registre_paiements_origine_check check (origine in ('evenement','historique','rapprochement'));

update public.registre_paiements set paye_fournisseur=null where origine='historique';


create table public.rapprochements_paiements (
 id uuid primary key default gen_random_uuid(),
 reference_session text not null references public.registre_paiements(reference_session),
 reference_paiement text,
 montant_cents integer not null,
 devise text not null,
 paye boolean not null,
 observe_le timestamptz not null default now(),
 unique nulls not distinct(reference_session,reference_paiement,montant_cents,devise,paye)
);
alter table public.rapprochements_paiements enable row level security;
revoke all on public.rapprochements_paiements from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create table public.tentatives_rapprochement (
 reference_session text primary key check(reference_session ~ '^cs_[A-Za-z0-9_]{1,196}$'),
 essaye_le timestamptz not null default now()
);
alter table public.tentatives_rapprochement enable row level security;
revoke all on public.tentatives_rapprochement from public,anon,authenticated,porteur_lien,serveur,depot_piece;
create function public.reserver_rapprochement(la_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
declare touchees integer;
begin
 insert into public.tentatives_rapprochement(reference_session) values(la_reference)
 on conflict(reference_session) do update set essaye_le=now() where tentatives_rapprochement.essaye_le<=now()-interval '15 minutes';
 get diagnostics touchees=row_count;
 return touchees=1;
end $$;
revoke all on function public.reserver_rapprochement(text) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.reserver_rapprochement(text) to serveur;
create function public.paiements_a_rapprocher()
returns table(reference_session text) language sql stable security definer set search_path='' as $$
 select candidat.reference_session from (
  select r.reference_session,r.recu_le from public.registre_paiements r where r.origine='historique' or r.paye_fournisseur=false
  union all
  select e.reference_session,min(e.recu_le) from public.evenements_paiements e
   where e.reference_session is not null and e.nature<>'paiement'
   and not exists(select 1 from public.registre_paiements r where r.reference_session=e.reference_session)
   group by e.reference_session
 ) candidat left join public.tentatives_rapprochement t on t.reference_session=candidat.reference_session
 where t.essaye_le is null or t.essaye_le<=now()-interval '15 minutes'
 order by t.essaye_le nulls first,candidat.recu_le,candidat.reference_session limit 2;
$$;
revoke all on function public.paiements_a_rapprocher() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.paiements_a_rapprocher() to serveur;

create function public.rapprocher_paiement(reference_session text,reference_paiement text,le_dossier uuid,montant integer,devise text,version_tarif text,paye boolean)
returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare regle public.registre_paiements; tarif public.tarifs_paiement; anomalie boolean; confirme boolean:=false; present uuid;
begin
 if reference_session is null or reference_session !~ '^cs_[A-Za-z0-9_]{1,196}$' or (reference_paiement is not null and reference_paiement !~ '^pi_[A-Za-z0-9_]{1,196}$')
 or le_dossier is null or montant is null or montant not between 1 and 100000000 or devise is null or devise !~ '^[a-z]{3}$'
 or version_tarif is null or version_tarif !~ '^[a-z0-9-]{1,64}$' or paye is null or (paye and reference_paiement is null) then raise exception 'Rapprochement financier invalide'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('paiement:'||coalesce(reference_paiement,reference_session),0));
 select d.id into present from public.dossiers d where d.id=le_dossier for update;
 select * into regle from public.registre_paiements r where r.reference_session=reference_session for update;
 if found and regle.source_dossier<>le_dossier then raise exception 'Contexte financier different'; end if;
 select * into tarif from public.tarifs_paiement t where t.version=version_tarif;
 anomalie:=not found or tarif.montant_cents is distinct from montant or tarif.devise is distinct from devise;
 if reference_paiement is not null and exists(select 1 from public.registre_paiements r where r.reference_paiement=reference_paiement and r.reference_session<>reference_session) then anomalie:=true; end if;
 if regle.reference_session is not null then
  anomalie:=anomalie or regle.anomalie or (regle.reference_paiement is not null and regle.reference_paiement is distinct from reference_paiement) or regle.tarif_version<>version_tarif;
  confirme:=regle.marque;
  if paye and not anomalie and not confirme then
   begin confirme:=public.marquer_dossier_paye(le_dossier,reference_session); exception when unique_violation then anomalie:=true; end;
  end if;
  update public.registre_paiements r set marque=confirme,reference_paiement=rapprocher_paiement.reference_paiement,montant_cents=montant,devise=rapprocher_paiement.devise,origine='rapprochement',paye_fournisseur=paye,anomalie=anomalie where r.reference_session=rapprocher_paiement.reference_session;
 else
  if paye and not anomalie then
   begin confirme:=public.marquer_dossier_paye(le_dossier,reference_session);
   exception when unique_violation then anomalie:=true; end;
  end if;
  insert into public.registre_paiements(reference_session,reference_paiement,dossier_id,source_dossier,montant_cents,devise,tarif_version,marque,anomalie,survenu_le,origine,paye_fournisseur)
  values(reference_session,reference_paiement,present,le_dossier,montant,devise,version_tarif,confirme,anomalie,now(),'rapprochement',paye);
 end if;
 insert into public.rapprochements_paiements(reference_session,reference_paiement,montant_cents,devise,paye)
 values(reference_session,reference_paiement,montant,devise,paye) on conflict do nothing;
 return true;
end $$;
revoke all on function public.rapprocher_paiement(text,text,uuid,integer,text,text,boolean) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.rapprocher_paiement(text,text,uuid,integer,text,text,boolean) to serveur;

-- Dernier rempart sous Repeatable Read : un meme paiement fournisseur ne peut
-- crediter deux sessions, meme si leur instantane precede le premier commit.
create unique index paiement_fournisseur_credite_unique on public.registre_paiements(reference_paiement) where marque and reference_paiement is not null;

create function public.conserver_tarif_paiement() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Version tarifaire immuable' using errcode='23514'; end $$;
revoke all on function public.conserver_tarif_paiement() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
create trigger conserver_tarif_paiement before update or delete on public.tarifs_paiement for each row execute function public.conserver_tarif_paiement();

-- Le locataire ne lit que le prix public de sa propre session, jamais les
-- montants du garant. Le garant n'a pas de parcours de paiement.
create function public.mon_tarif_paiement()
returns table(montant_cents integer,devise text,tarif_version text)
language sql stable security definer set search_path='' as $$
 select s.montant_cents,s.devise,s.tarif_version from public.sessions_paiement s
 where public.partie_courante()='locataire' and s.dossier_id=public.dossier_courant();
$$;
revoke all on function public.mon_tarif_paiement() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.mon_tarif_paiement() to porteur_lien;
