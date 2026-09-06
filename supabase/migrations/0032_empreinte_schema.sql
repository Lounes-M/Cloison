-- Empreintes du catalogue, jamais des dossiers ni du contenu des pieces.
-- La reference locale et la reference de production sont revues et versionnees.
create function public.empreinte_schema()
returns jsonb language sql stable security definer set search_path='' as $empreinte$
with objets as (
 select n.nspname,c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','v','S')
 and not exists(select 1 from pg_depend d where d.objid=c.oid and d.classid='pg_class'::regclass and d.deptype='e')
), fonctions as (
 select n.nspname,p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind in ('f','p')
 and not exists(select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
)
, catalogue as (select jsonb_build_object(
 'tables',(select jsonb_agg(to_jsonb(t) order by t.nom) from (select relname as nom,relkind,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(relacl) a) as droits from objets) t),
 'colonnes',(select jsonb_agg(to_jsonb(t) order by t.table_nom,t.nom) from (select c.relname as table_nom,a.attname as nom,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as defaut from objets c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped and c.relkind<>'S') t),
 'contraintes',(select jsonb_agg(to_jsonb(t) order by t.table_nom,t.nom) from (select c.relname as table_nom,k.conname as nom,pg_get_constraintdef(k.oid) as definition from objets c join pg_constraint k on k.conrelid=c.oid) t),
 'fonctions',(select jsonb_agg(to_jsonb(t) order by t.nom,t.arguments) from (select proname as nom,pg_get_function_identity_arguments(oid) as arguments,pg_get_userbyid(proowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(proacl) a) as droits,pg_get_functiondef(oid) as definition from fonctions) t),
 'politiques',(select jsonb_agg(to_jsonb(t) order by schemaname,tablename,policyname) from (select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects' )) t),
 'declencheurs',(select jsonb_agg(to_jsonb(t) order by t.table_nom,t.nom) from (select c.relname as table_nom,t.tgname as nom,t.tgenabled,pg_get_triggerdef(t.oid) as definition from objets c join pg_trigger t on t.tgrelid=c.oid where not t.tgisinternal) t),
 'roles',(select jsonb_agg(to_jsonb(t) order by rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname in ('anon','authenticated','porteur_lien','serveur','depot_piece')) t),
 'indexes',(select jsonb_agg(to_jsonb(t) order by tablename,indexname) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public') t),
 'adhesions',(select jsonb_agg(to_jsonb(t) order by role_nom,membre) from (select r.rolname as role_nom,m.rolname as membre,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member) t),
 'stockage',(select jsonb_agg(to_jsonb(t) order by t.nom) from (select c.relname as nom,c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(a::text order by a::text) from unnest(c.relacl) a) as droits from pg_class c where c.oid='storage.objects'::regclass) t),
 'bucket',(select jsonb_agg(to_jsonb(t) order by id) from (select id,public from storage.buckets where id='pieces') t),
 'schema',(select jsonb_agg(to_jsonb(t) order by nspname) from (select nspname,pg_get_userbyid(nspowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(nspacl) a) as droits from pg_namespace where nspname='public') t)
) as donnees)
select jsonb_build_object('version',1,'empreintes',
 (select jsonb_object_agg(cle,encode(sha256(convert_to(valeur::text,'UTF8')),'hex'))
 from catalogue cross join lateral jsonb_each(donnees) as e(cle,valeur)));

$empreinte$;
revoke all on function public.empreinte_schema() from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.empreinte_schema() to serveur;
