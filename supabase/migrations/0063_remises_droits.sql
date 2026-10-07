-- Paquets de droits chiffres avec une cle distincte, jamais stockee ici.
create table public.remises_droits (
 id uuid primary key,
 demande uuid not null,
 revision uuid not null,
 approbation_sha256 text not null check(approbation_sha256 ~ '^[a-f0-9]{64}$'),
 jeton_sha256 text not null check(jeton_sha256 ~ '^[a-f0-9]{64}$'),
 preuve_acces_sha256 text not null check(preuve_acces_sha256 ~ '^[a-f0-9]{64}$'),
 archive_sha256 text not null check(archive_sha256 ~ '^[a-f0-9]{64}$'),
 taille integer not null check(taille between 29 and 94371840),
 manifeste jsonb not null check(jsonb_typeof(manifeste)='object' and octet_length(manifeste::text)<=262144),
 cree_le timestamptz not null default clock_timestamp(),
 expire_le timestamptz not null,
 disponible boolean not null default false,
 revoque_le timestamptz,
 premier_acces_le timestamptz,
 recu_le timestamptz,
 purge_le timestamptz,
 acces integer not null default 0 check(acces between 0 and 30),
 check(isfinite(expire_le) and expire_le>cree_le and expire_le<=cree_le+interval '72 hours'),
 check(manifeste ?& array['demande','revision','decisionSha256'] and manifeste->>'demande'=demande::text and manifeste->>'revision'=revision::text
   and manifeste->>'decisionSha256'=approbation_sha256)
);
alter table public.remises_droits enable row level security;
revoke all on public.remises_droits from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create index remises_droits_expiration on public.remises_droits(expire_le,id);
create index remises_droits_revision on public.remises_droits(revision);
insert into storage.buckets(id,name,public) values('exports-droits','exports-droits',false);

create function public.remise_droits_active(le_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.remises_droits r join public.suivi_demandes_droits s
 on s.operation=r.revision and s.demande=r.demande and s.preuve_sha256=r.approbation_sha256
 where r.id=le_id and r.disponible and r.purge_le is null and r.revoque_le is null and r.expire_le>clock_timestamp()
 and s.etat='en_cours' and s.nature in ('acces','portabilite') and s.effacer_le>=r.expire_le
 and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation));
$$;

create function public.autoriser_remise_droits(le_id uuid,le_jeton text,la_preuve text,confirmer boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.remises_droits;
begin
 if le_jeton is null or le_jeton !~ '^[a-f0-9]{64}$' or la_preuve is null or la_preuve !~ '^[a-f0-9]{64}$' or confirmer is null then return null;end if;
 select * into r from public.remises_droits where id=le_id and jeton_sha256=le_jeton and preuve_acces_sha256=la_preuve;
 if not found then return null;end if;
 -- Meme verrou que l'inscription d'une nouvelle decision administrative.
 perform pg_advisory_xact_lock(hashtextextended(r.demande::text,5353));
 select * into r from public.remises_droits where id=le_id and jeton_sha256=le_jeton and preuve_acces_sha256=la_preuve for update;
 if not found or not public.remise_droits_active(le_id) or r.acces>=30 then return null;end if;
 update public.remises_droits set acces=acces+1,premier_acces_le=coalesce(premier_acces_le,clock_timestamp()),
 recu_le=case when confirmer then coalesce(recu_le,clock_timestamp()) else recu_le end where id=le_id;
 return jsonb_build_object('id',r.id,'manifeste',r.manifeste,'taille',r.taille,'sha256',r.archive_sha256,
 'expireLe',r.expire_le,'secondes',greatest(0,least(30,floor(extract(epoch from r.expire_le-clock_timestamp())))),'recu',confirmer);
end;$$;

create function public.export_droits_a_supprimer(le_chemin text) returns boolean
language sql stable security definer set search_path='' as $$
 select le_chemin ~ '^[a-f0-9-]{36}$' and (
 exists(select 1 from public.remises_droits r where r.id::text=le_chemin and
  (r.expire_le<=clock_timestamp() or r.revoque_le is not null or r.purge_le is not null or
   (not r.disponible and r.cree_le<clock_timestamp()-interval '15 minutes') or
   (r.disponible and not public.remise_droits_active(r.id))))
 or (not exists(select 1 from public.remises_droits r where r.id::text=le_chemin) and
 exists(select 1 from storage.objects o where o.bucket_id='exports-droits' and o.name=le_chemin and o.created_at<clock_timestamp()-interval '15 minutes')));
$$;
create function public.remises_droits_a_purger() returns setof text
language plpgsql security definer set search_path='' as $$
begin
 delete from public.remises_droits where id in (select id from public.remises_droits where purge_le is not null and expire_le<=clock_timestamp() order by expire_le limit 100);
 return query select chemin from (
 select r.id::text chemin,r.cree_le ancien from public.remises_droits r where (r.purge_le is null or exists(select 1 from storage.objects o where o.bucket_id='exports-droits' and o.name=r.id::text)) and public.export_droits_a_supprimer(r.id::text)
 union all
 select o.name,o.created_at from storage.objects o where o.bucket_id='exports-droits'
 and not exists(select 1 from public.remises_droits r where r.id::text=o.name) and public.export_droits_a_supprimer(o.name)
 ) q order by ancien,chemin limit 100;
end;$$;
create function public.acquitter_remise_droits(le_chemin text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.remises_droits where id::text=le_chemin for update;
 if exists(select 1 from storage.objects where bucket_id='exports-droits' and name=le_chemin) then return false;end if;
 if exists(select 1 from public.remises_droits where id::text=le_chemin) then
  if not public.export_droits_a_supprimer(le_chemin) then return false;end if;
  update public.remises_droits set purge_le=clock_timestamp() where id::text=le_chemin;
 end if;
 return true;
end;$$;
revoke all on function public.remise_droits_active(uuid),public.autoriser_remise_droits(uuid,text,text,boolean),public.export_droits_a_supprimer(text),public.remises_droits_a_purger(),public.acquitter_remise_droits(text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.remise_droits_active(uuid),public.autoriser_remise_droits(uuid,text,text,boolean),public.export_droits_a_supprimer(text),public.remises_droits_a_purger(),public.acquitter_remise_droits(text) to serveur;
create function public.remises_droits_a_lire(le_chemin text) returns setof boolean
language sql stable security definer set search_path='' as $$
 select true from public.remises_droits r where r.id::text=le_chemin and public.remise_droits_active(r.id);
$$;
revoke all on function public.remises_droits_a_lire(text) from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.remises_droits_a_lire(text) to serveur;
create policy "Lecture des paquets droits chiffres" on storage.objects for select to serveur
 using(bucket_id='exports-droits' and (public.export_droits_a_supprimer(name) or exists(select 1 from public.remises_droits_a_lire(name))));
create policy "Suppression des paquets droits expires" on storage.objects for delete to serveur
 using(bucket_id='exports-droits' and public.export_droits_a_supprimer(name));

-- Compteurs partages avant toute analyse ou rasterisation documentaire.
create or replace function public.consommer_debit(le_sujet text, l_empreinte text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plafond  integer;
  duree    interval;
  la_cle   text;
  debut    timestamptz;
  atteint  integer;
begin
  -- Les plafonds vivent ici, hors de portee de l'appelant.
  case le_sujet
    when 'remise_ip' then plafond := 30; duree := interval '15 minutes';
    when 'remise_global' then plafond := 300; duree := interval '15 minutes';
    when 'depot_dossier' then plafond := 20; duree := interval '15 minutes';
    when 'depot_ip' then plafond := 60; duree := interval '15 minutes';
    when 'depot_global' then plafond := 300; duree := interval '15 minutes';
    -- Le formulaire agence : du bruit ordinaire, rien de sensible derriere.
    when 'demande_agence' then
      plafond := 5;  duree := interval '10 minutes';

    -- Les points qui envoient un e-mail a une adresse choisie par l'appelant.
    when 'lien_locataire' then
      plafond := 3;  duree := interval '15 minutes';
    when 'lien_garant' then
      plafond := 3;  duree := interval '15 minutes';

    -- La connexion agence en fait partie, avec un plafond un peu plus large :
    -- un bureau derriere une seule adresse IP publique compte pour un, et
    -- plusieurs collaborateurs peuvent se connecter dans la meme heure.
    when 'connexion_agence' then
      plafond := 10; duree := interval '15 minutes';

    -- `ouvrir_dossier` est accessible en `anon` par construction : le locataire
    -- arrive avant d'avoir un jeton. Sans limite, on remplit la table.
    when 'ouverture_dossier' then
      plafond := 10; duree := interval '1 hour';

    else
      raise exception 'Sujet de limitation inconnu : %', le_sujet
        using errcode = 'check_violation';
  end case;

  -- Une empreinte, pas une adresse. Le refus est net : une valeur qui n'a pas
  -- cette forme signale un appelant qui a saute le calcul, donc une limite qui
  -- ne limiterait rien.
  if l_empreinte is null or l_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte attendue en sha256 hexadecimal.'
      using errcode = 'check_violation';
  end if;

  la_cle := le_sujet || ':' || l_empreinte;
  debut  := date_bin(duree, now(), timestamptz 'epoch');

  -- Les seaux passes de cette cle ne servent plus a rien. Les effacer ici borne
  -- la table a une ligne par cle vivante, sans tache de fond a surveiller.
  delete from public.debits d where d.cle = la_cle and d.fenetre < debut;

  insert into public.debits (cle, fenetre, compte)
  values (la_cle, debut, 1)
  on conflict (cle, fenetre) do update set compte = debits.compte + 1
  returning compte into atteint;

  return atteint <= plafond;
end;
$$;

revoke all on function public.consommer_debit(text,text) from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.consommer_debit(text,text) to serveur;

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
 'bucket',(select jsonb_agg(to_jsonb(t) order by id) from (select id,public from storage.buckets where id in ('pieces','actes','exports-droits')) t),
 'schema',(select jsonb_agg(to_jsonb(t) order by nspname) from (select nspname,pg_get_userbyid(nspowner) as proprietaire,(select jsonb_agg(a::text order by a::text) from unnest(nspacl) a) as droits,(select jsonb_agg(to_jsonb(x) order by x.proprietaire,x.espace,x.objet) from (select pg_get_userbyid(d.defaclrole) as proprietaire,d.defaclnamespace::regnamespace::text as espace,d.defaclobjtype as objet,(select jsonb_agg(z::text order by z::text) from unnest(d.defaclacl) z) as droits from pg_default_acl d where d.defaclnamespace=0 or d.defaclnamespace=pg_namespace.oid) x) as droits_futurs from pg_namespace where nspname='public') t)
) as donnees)
select jsonb_build_object('version',1,'empreintes',
 (select jsonb_object_agg(cle,encode(sha256(convert_to(valeur::text,'UTF8')),'hex'))
 from catalogue cross join lateral jsonb_each(donnees) as e(cle,valeur)));

$empreinte$;

notify pgrst,'reload schema';
