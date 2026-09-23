-- Un reglement agence n'existe qu'apres la creance unique creee a la signature.
create table public.reglements_actes (
 id uuid primary key default gen_random_uuid(),
 facture_id uuid not null references public.factures_actes(id),
 session_ref text unique check(session_ref ~ '^cs_[A-Za-z0-9_]{1,190}$'),
 paiement_ref text unique check(paiement_ref ~ '^pi_[A-Za-z0-9_]{1,190}$'),
 etat text not null default 'reserve' check(etat in ('reserve','ouvert','expire','paye','rembourse','litige')),
 cree_le timestamptz not null default clock_timestamp(),
 rapproche_le timestamptz,
 prochain_rapprochement timestamptz not null default clock_timestamp(),
 rembourse_cents integer not null default 0 check(rembourse_cents>=0),
 anomalie boolean not null default false
);
create unique index un_reglement_actif on public.reglements_actes(facture_id) where etat<>'expire';
alter table public.reglements_actes enable row level security;
revoke all on public.reglements_actes from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;

create function public.reserver_reglement_acte(la_facture uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.factures_actes; r public.reglements_actes;
begin
 select * into f from public.factures_actes where id=la_facture and agence_id=public.agence_courante() for update;
 if not found or f.paye_le is not null or not exists(select 1 from public.agences where id=f.agence_id and statut='verifiee') then return null;end if;
 select * into r from public.reglements_actes where facture_id=f.id and etat<>'expire';
 if not found then
  if (select count(*) from public.reglements_actes where facture_id=f.id)>=10 then return null;end if;
  insert into public.reglements_actes(facture_id) values(f.id) returning * into r;
 end if;
 if r.anomalie or r.etat not in ('reserve','ouvert') then return null;end if;
 return jsonb_build_object('id',r.id,'facture',f.id,'montant',f.montant_cents,'tarif',f.tarif_version,'session',r.session_ref,'cree_le',r.cree_le);
end;$$;
create function public.rattacher_reglement_acte(le_id uuid,la_session text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if la_session is null or la_session !~ '^cs_[A-Za-z0-9_]{1,190}$' then return false;end if;
 update public.reglements_actes set session_ref=la_session,etat='ouvert' where id=le_id and not anomalie and etat in ('reserve','ouvert') and (session_ref is null or session_ref=la_session);
 return found;
end;$$;
create function public.rapprocher_reglement_acte(le_id uuid,la_facture uuid,la_session text,le_paiement text,montant integer,devise text,tarif text,statut text,rembourse integer,conteste boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.reglements_actes; f public.factures_actes;
begin
 select * into f from public.factures_actes where id=la_facture for update;
 if not found then return false;end if;
 select * into r from public.reglements_actes where id=le_id and facture_id=f.id for update;
 if not found then return false;end if;
 if r.anomalie or r.session_ref is distinct from la_session or f.montant_cents is distinct from montant or devise is distinct from 'eur' or f.tarif_version is distinct from tarif
 or statut is null or statut not in ('ouvert','expire','paye') or rembourse is null or rembourse<0 or rembourse>montant or conteste is null
 or (statut='paye' and (le_paiement is null or le_paiement !~ '^pi_[A-Za-z0-9_]{1,190}$'))
 or (r.paiement_ref is not null and r.paiement_ref is distinct from le_paiement)
 or (r.etat='expire' and statut<>'expire') then
  update public.reglements_actes set anomalie=true where id=le_id;return false;
 end if;
 -- Une lecture ancienne ou hors ordre ne revoque jamais un paiement confirme.
 if r.etat in ('paye','rembourse','litige') and statut<>'paye' then return false;end if;
 update public.reglements_actes set etat=case when conteste or r.etat='litige' then 'litige' when rembourse>0 or r.etat='rembourse' then 'rembourse' else statut end,
 paiement_ref=coalesce(le_paiement,paiement_ref),rembourse_cents=greatest(rembourse,rembourse_cents),rapproche_le=clock_timestamp(),prochain_rapprochement=clock_timestamp()+case when statut='ouvert' then interval '1 hour' else interval '1 day' end where id=le_id;
 if statut='paye' then
  if f.paiement_ref is not null and f.paiement_ref is distinct from le_paiement then update public.reglements_actes set anomalie=true where id=le_id;return false;end if;
  update public.factures_actes set paye_le=coalesce(paye_le,clock_timestamp()),paiement_ref=le_paiement where id=f.id;
 end if;
 return true;
end;$$;
create function public.reglements_actes_a_rapprocher() returns jsonb language sql volatile security definer set search_path='' as $$
 with candidats as (select id from public.reglements_actes where session_ref is not null and not anomalie and etat<>'expire' and prochain_rapprochement<=clock_timestamp() order by prochain_rapprochement,id for update skip locked limit 3),
 reserves as (update public.reglements_actes set prochain_rapprochement=clock_timestamp()+interval '5 minutes' where id in(select id from candidats) returning id,session_ref)
 select coalesce(jsonb_agg(reserves),'[]'::jsonb) from reserves;
$$;
create function public.reglements_actes_a_examiner() returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.reglements_actes where anomalie or (session_ref is null and cree_le<clock_timestamp()-interval '23 hours');
$$;
create function public.factures_de_mon_agence(avant uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(t),'[]'::jsonb) from (select f.id,f.montant_cents,f.cree_le,f.paye_le,f.tarif_version,coalesce(r.etat,'a_regler') etat,r.anomalie,r.rembourse_cents
 from public.factures_actes f left join public.reglements_actes r on r.facture_id=f.id and r.etat<>'expire'
 where f.agence_id=public.agence_courante() and (avant is null or f.id<avant) order by f.id desc limit 20) t;
$$;
revoke all on function public.reserver_reglement_acte(uuid),public.rattacher_reglement_acte(uuid,text),public.rapprocher_reglement_acte(uuid,uuid,text,text,integer,text,text,text,integer,boolean),public.reglements_actes_a_rapprocher(),public.reglements_actes_a_examiner(),public.factures_de_mon_agence(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
grant execute on function public.reserver_reglement_acte(uuid),public.factures_de_mon_agence(uuid) to authenticated;
grant execute on function public.rattacher_reglement_acte(uuid,text),public.rapprocher_reglement_acte(uuid,uuid,text,text,integer,text,text,text,integer,boolean),public.reglements_actes_a_rapprocher(),public.reglements_actes_a_examiner() to serveur;

-- Le perimetre de surveillance inclut le stockage et le role des actes.
create or replace function public.empreinte_schema()
returns jsonb language sql stable security definer set search_path='' as $empreinte$
with objets as (
 select n.nspname,c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','S')
 and not exists(select 1 from pg_depend d where d.objid=c.oid and d.classid='pg_class'::regclass and d.deptype='e')
), fonctions as (
 select n.nspname,p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind in ('f','p')
 and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
)
, catalogue as (select jsonb_build_object(
 'tables',(select jsonb_agg(to_jsonb(t) order by t.nom) from (select relname as nom,relkind,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(relacl) a) as droits from objets) t),
 'colonnes',(select jsonb_agg(to_jsonb(t) order by t.table_nom,t.nom) from (select c.relname as table_nom,a.attname as nom,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,a.attidentity,a.attgenerated,(select jsonb_agg(x::text order by x::text) from unnest(a.attacl) x) as droits,pg_get_expr(d.adbin,d.adrelid) as defaut from objets c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped and c.relkind<>'S') t),
 'contraintes',(select jsonb_agg(to_jsonb(t) order by t.table_nom,t.nom) from (select c.relname as table_nom,k.conname as nom,pg_get_constraintdef(k.oid) as definition from objets c join pg_constraint k on k.conrelid=c.oid) t),
 'fonctions',(select jsonb_agg(to_jsonb(t) order by t.nom,t.arguments) from (select proname as nom,pg_get_function_identity_arguments(oid) as arguments,pg_get_userbyid(proowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(proacl) a) as droits,pg_get_functiondef(oid) as definition from fonctions) t),
 'politiques',(select jsonb_agg(to_jsonb(t) order by schemaname,tablename,policyname) from (select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects' )) t),
 'declencheurs',(select jsonb_agg(to_jsonb(t) order by t.table_nom,t.nom) from (select c.relname as table_nom,t.tgname as nom,t.tgenabled,pg_get_triggerdef(t.oid) as definition from objets c join pg_trigger t on t.tgrelid=c.oid where not t.tgisinternal) t),
 'roles',(select jsonb_agg(to_jsonb(t) order by rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname in ('anon','authenticated','porteur_lien','serveur','depot_piece','archive_signature')) t),
 'indexes',(select jsonb_agg(to_jsonb(t) order by tablename,indexname) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public') t),
 'adhesions',(select jsonb_agg(to_jsonb(t) order by role_nom,membre) from (select r.rolname as role_nom,m.rolname as membre,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member) t),
 'stockage',(select jsonb_agg(to_jsonb(t) order by t.nom) from (select c.relname as nom,c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(a::text order by a::text) from unnest(c.relacl) a) as droits,(select jsonb_agg(to_jsonb(x) order by x.nom) from (select a.attname as nom,(select jsonb_agg(z::text order by z::text) from unnest(a.attacl) z) as droits from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) x) as colonnes from pg_class c where c.oid='storage.objects'::regclass) t),
 'bucket',(select jsonb_agg(to_jsonb(t) order by id) from (select id,public from storage.buckets where id in ('pieces','actes')) t),
 'schema',(select jsonb_agg(to_jsonb(t) order by nspname) from (select nspname,pg_get_userbyid(nspowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(nspacl) a) as droits,(select jsonb_agg(to_jsonb(x) order by x.proprietaire,x.espace,x.objet) from (select pg_get_userbyid(d.defaclrole) as proprietaire,d.defaclnamespace::regnamespace::text as espace,d.defaclobjtype as objet,(select jsonb_agg(z::text order by z::text) from unnest(d.defaclacl) z) as droits from pg_default_acl d where d.defaclnamespace=0 or d.defaclnamespace=pg_namespace.oid) x) as droits_futurs from pg_namespace where nspname='public') t)
) as donnees)
select jsonb_build_object('version',1,'empreintes',
 (select jsonb_object_agg(cle,encode(sha256(convert_to(valeur::text,'UTF8')),'hex'))
 from catalogue cross join lateral jsonb_each(donnees) as e(cle,valeur)));

$empreinte$;
