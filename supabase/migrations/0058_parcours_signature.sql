-- Les actes disposent de leur propre cle et de leur propre classe de conservation.
create table public.actes_signature (
 id uuid primary key references public.demandes_signature(id),
 agence_id uuid not null references public.agences(id),
 modele text not null check(char_length(modele) between 1 and 120),
 version_conditions bigint not null check(version_conditions>0),
 cle_scellee bytea not null check(octet_length(cle_scellee) between 60 and 256),
 contexte_chiffre bytea not null check(octet_length(contexte_chiffre) between 29 and 16384),
 etape text not null default 'preparation' check(etape in ('preparation','a_valider','valide','document','signataire','activation','en_cours','archive','refuse','incertain')),
 valide_le timestamptz,
 expire_signature timestamptz not null,
 conserver_jusqu_au timestamptz not null,
 document_fournisseur uuid,
 signataire_fournisseur uuid,
 operation uuid,
 operation_jusqu_au timestamptz,
 archive_le timestamptz,
 check(conserver_jusqu_au>expire_signature)
);
create table public.fichiers_signature (
 id uuid primary key default gen_random_uuid(),
 acte_id uuid not null references public.actes_signature(id),
 nature text not null check(nature in ('projet','acte','preuve')),
 empreinte text not null check(empreinte ~ '^[0-9a-f]{64}$'),
 taille integer not null check(taille between 8 and 20971520),
 nonce bytea not null check(octet_length(nonce)=12),
 confirme boolean not null default false,
 unique(acte_id,nature), unique(acte_id,nonce)
);
create table public.journal_signatures (
 id bigint generated always as identity primary key,
 acte_id uuid not null references public.actes_signature(id),
 action text not null check(action in ('prepare','valide','refuse','ouvert','archive')),
 acteur uuid,
 quand timestamptz not null default clock_timestamp()
);
alter table public.actes_signature enable row level security;
alter table public.fichiers_signature enable row level security;
alter table public.journal_signatures enable row level security;
revoke all on public.actes_signature,public.fichiers_signature,public.journal_signatures from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
revoke all on sequence public.journal_signatures_id_seq from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;

-- Un jeton de stockage ne porte qu'un fichier et ne donne aucune cle de dechiffrement.
create role archive_signature nologin noinherit;
grant archive_signature to authenticator;
grant usage on schema public,storage to archive_signature;
grant select,insert,delete on storage.objects to archive_signature;
grant select on storage.buckets to archive_signature;
insert into storage.buckets(id,name,public) values('actes','actes',false);

create function public.acces_fichier_signature(le_chemin text,ecriture boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fichiers_signature f join public.actes_signature a on a.id=f.acte_id
 where le_chemin=a.id::text||'/'||f.id::text
 and f.id::text=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'fichier_signature'
 and a.conserver_jusqu_au>clock_timestamp() and a.cle_scellee is not null
 and (f.nature<>'projet' or a.etape='archive' or a.expire_signature>clock_timestamp())
 and (not ecriture or (not f.confirme and a.etape not in ('archive','refuse'))));
$$;
revoke all on function public.acces_fichier_signature(text,boolean) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.acces_fichier_signature(text,boolean) to archive_signature;
create policy "Fichier acte borne en lecture" on storage.objects for select to archive_signature
 using(bucket_id='actes' and public.acces_fichier_signature(name,false));
create policy "Fichier acte immuable" on storage.objects for insert to archive_signature
 with check(bucket_id='actes' and public.acces_fichier_signature(name,true));
-- La suppression n'est pas accordee par une politique utilisateur.

create function public.acte_signature_accessible(le_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.actes_signature a
 join public.demandes_signature s on s.id=a.id
 left join public.dossiers d on d.id=s.dossier_id
 where a.id=le_id and a.conserver_jusqu_au>clock_timestamp() and a.cle_scellee is not null
 and (a.etape='archive' or a.expire_signature>clock_timestamp())
 and ((a.agence_id=public.agence_courante() and exists(select 1 from public.agences g where g.id=a.agence_id and g.statut='verifiee')
 and (a.etape='archive' or (d.expire_le>clock_timestamp() and d.statut='transmis')))
 or (public.partie_courante()='garant' and public.dossier_courant()=s.dossier_id and d.statut in ('transmis','signe'))));
$$;
revoke all on function public.acte_signature_accessible(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.acte_signature_accessible(uuid) to authenticated,porteur_lien;

create function public.preparer_acte_signature(le_id uuid,le_dossier uuid,le_mode text,le_modele text,la_version bigint,
 empreinte text,cle bytea,contexte bytea,expiration timestamptz,conservation timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; e public.engagements;
begin
 if le_id is null or le_mode not in ('sandbox','production') or le_mode is null or empreinte is null or empreinte !~ '^[0-9a-f]{64}$'
 or expiration is null or not isfinite(expiration) or expiration<=clock_timestamp() or expiration>clock_timestamp()+interval '30 days'
 or conservation is null or not isfinite(conservation) or conservation<=expiration or conservation>clock_timestamp()+interval '50 years' then return null;end if;
 select * into d from public.dossiers where id=le_dossier and agence_id=public.agence_courante() for update;
 if not found or d.demonstration or d.statut<>'transmis' or d.expire_le<expiration
 or not exists(select 1 from public.agences where id=d.agence_id and statut='verifiee') then return null;end if;
 select * into e from public.engagements where dossier_id=d.id;
 if not found or e.version_conditions is distinct from la_version or e.mention is null or e.nom is null or e.prenom is null or e.mention_saisie_le is null then return null;end if;
 if (select count(*) from public.demandes_signature where source_dossier=d.id and environnement=le_mode)>=5 or exists(select 1 from public.demandes_signature s left join public.actes_signature a on a.id=s.id where s.source_dossier=d.id and s.environnement=le_mode and (a.id is null or (a.etape<>'refuse' and s.etat not in ('canceled','declined','rejected','deleted','expired')))) then return null;end if;
 insert into public.demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte) values(le_id,d.id,d.id,le_mode,empreinte);
 insert into public.actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,expire_signature,conserver_jusqu_au)
 values(le_id,d.agence_id,le_modele,la_version,cle,contexte,expiration,conservation);
 insert into public.journal_signatures(acte_id,action,acteur) values(le_id,'prepare',auth.uid());
 return le_id;
end;$$;

create function public.lire_acte_signature(le_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.acte_signature_accessible(le_id) then return null;end if;
 return (select jsonb_build_object('acte',to_jsonb(a),'demande',jsonb_build_object('id',s.id,'environnement',s.environnement,'etat',s.etat,'empreinte_acte',s.empreinte_acte),
 'fichiers',coalesce((select jsonb_agg(to_jsonb(f)) from public.fichiers_signature f where f.acte_id=a.id),'[]'::jsonb))
 from public.actes_signature a join public.demandes_signature s on s.id=a.id where a.id=le_id);
end;$$;
create function public.actes_du_dossier(le_dossier uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'etape',a.etape,'modele',a.modele,'environnement',s.environnement,'etat',s.etat)), '[]'::jsonb)
 from public.actes_signature a join public.demandes_signature s on s.id=a.id
 where s.source_dossier=le_dossier and public.acte_signature_accessible(a.id);
$$;
create function public.valider_acte_signature(le_id uuid,empreinte text,accepter boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.actes_signature; s public.demandes_signature;
begin
 select * into s from public.demandes_signature where id=le_id;
 if not found or public.partie_courante()<>'garant' or public.dossier_courant() is distinct from s.dossier_id then return false;end if;
 perform 1 from public.dossiers where id=s.dossier_id and statut='transmis' and expire_le>clock_timestamp() for update;
 if not found then return false;end if;
 select * into a from public.actes_signature where id=le_id for update;
 if not found or a.etape<>'a_valider' or a.expire_signature<=clock_timestamp() or s.empreinte_acte is distinct from empreinte or accepter is null then return false;end if;
 if not exists(select 1 from public.engagements e where e.dossier_id=s.dossier_id and e.version_conditions=a.version_conditions and e.mention is not null) then return false;end if;
 update public.actes_signature set etape=case when accepter then 'valide' else 'refuse' end,valide_le=case when accepter then clock_timestamp() end where id=le_id;
 insert into public.journal_signatures(acte_id,action) values(le_id,case when accepter then 'valide' else 'refuse' end);
 return true;
end;$$;
create function public.journaliser_lecture_acte(le_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not public.acte_signature_accessible(le_id) then return false;end if;
 insert into public.journal_signatures(acte_id,action,acteur) values(le_id,'ouvert',auth.uid());
 return true;
end;$$;

-- Fonctions de travail serveur : aucune mutation fournisseur n'est rejouee apres un resultat incertain.
create function public.charger_acte_signature(le_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('acte',to_jsonb(a),'demande',to_jsonb(s),'fichiers',coalesce((select jsonb_agg(to_jsonb(f)) from public.fichiers_signature f where f.acte_id=a.id),'[]'::jsonb))
 from public.actes_signature a join public.demandes_signature s on s.id=a.id where a.id=le_id and a.conserver_jusqu_au>clock_timestamp();
$$;
create function public.reserver_fichier_signature(le_id uuid,la_nature text,empreinte text,taille integer,nonce bytea) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.actes_signature; f public.fichiers_signature;
begin
 select * into a from public.actes_signature where id=le_id for update;
 if not found or a.conserver_jusqu_au<=clock_timestamp() or a.etape in ('archive','refuse') then return null;end if;
 if (la_nature='projet' and a.etape<>'preparation') or (la_nature in ('acte','preuve') and a.etape<>'en_cours') then return null;end if;
 select * into f from public.fichiers_signature where acte_id=le_id and nature=la_nature;
 if found then
  if f.empreinte is distinct from empreinte or f.taille is distinct from taille then return null;end if;
  return to_jsonb(f);
 end if;
 insert into public.fichiers_signature(acte_id,nature,empreinte,taille,nonce) values(le_id,la_nature,empreinte,taille,nonce) returning * into f;
 return to_jsonb(f);
end;$$;
create function public.confirmer_fichier_signature(le_fichier uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare f public.fichiers_signature;
begin
 select * into f from public.fichiers_signature where id=le_fichier;
 if not found or not exists(select 1 from storage.objects where bucket_id='actes' and name=f.acte_id::text||'/'||f.id::text) then return false;end if;
 perform 1 from public.actes_signature where id=f.acte_id and conserver_jusqu_au>clock_timestamp() for update;
 if not found then return false;end if;
 update public.fichiers_signature set confirme=true where id=le_fichier;
 if f.nature='projet' then update public.actes_signature set etape='a_valider' where id=f.acte_id and etape='preparation';end if;
 return true;
end;$$;
create function public.reserver_operation_acte(le_id uuid,etape_attendue text) returns uuid
language plpgsql security definer set search_path='' as $$
declare resultat uuid;
begin
 if etape_attendue not in ('valide','document','signataire','activation') then return null;end if;
 perform 1 from public.dossiers d join public.demandes_signature s on s.dossier_id=d.id
 where s.id=le_id and d.statut='transmis' and d.expire_le>clock_timestamp() and not s.anomalie for update of d;
 if not found then return null;end if;
 update public.actes_signature set operation=gen_random_uuid(),operation_jusqu_au=clock_timestamp()+interval '2 minutes'
 where id=le_id and etape=etape_attendue and operation is null and valide_le is not null and expire_signature>clock_timestamp()
 returning operation into resultat;
 return resultat;
end;$$;
create function public.confirmer_operation_acte(le_id uuid,le_bail uuid,etape_attendue text,reference uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.actes_signature;
begin
 select * into a from public.actes_signature where id=le_id for update;
 if not found or le_bail is null or a.operation is distinct from le_bail or a.operation_jusqu_au<=clock_timestamp() or a.etape is distinct from etape_attendue or reference is null then return false;end if;
 if etape_attendue='valide' then
  if not public.rattacher_demande_signature(le_id,reference,(select environnement from public.demandes_signature where id=le_id)) then return false;end if;
 elsif etape_attendue='document' then
  update public.actes_signature set document_fournisseur=reference where id=le_id;
 elsif etape_attendue='signataire' then
  update public.actes_signature set signataire_fournisseur=reference where id=le_id;
 elsif etape_attendue='activation' then
  if reference is distinct from (select reference_fournisseur from public.demandes_signature where id=le_id) then return false;end if;
 else return false;end if;
 update public.actes_signature set etape=case etape_attendue when 'valide' then 'document' when 'document' then 'signataire' when 'signataire' then 'activation' else 'en_cours' end,operation=null,operation_jusqu_au=null where id=le_id;
 return true;
end;$$;
create function public.actes_a_traiter(le_mode text) returns setof uuid language sql stable security definer set search_path='' as $$
 select a.id from public.actes_signature a join public.demandes_signature s on s.id=a.id
 join public.dossiers d on d.id=s.dossier_id
 where s.environnement=le_mode and not s.anomalie and d.statut='transmis' and d.expire_le>clock_timestamp()
 and (a.expire_signature>clock_timestamp() or (a.etape='en_cours' and s.etat='done')) and a.operation is null
 and ((a.etape in ('valide','document','signataire','activation') and s.etat not in ('canceled','declined','rejected','deleted','expired')) or (a.etape='en_cours' and s.etat='done'))
 order by s.cree_le limit 1;
$$;
create function public.publier_archive_signature(le_id uuid,la_revision bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.actes_signature; s public.demandes_signature;
begin
 select * into s from public.demandes_signature where id=le_id;
 if not found then return false;end if;
 perform 1 from public.dossiers where id=s.dossier_id and statut in ('transmis','signe') and expire_le>clock_timestamp() for update;
 if not found then return false;end if;
 select * into a from public.actes_signature where id=le_id for update;
 select * into s from public.demandes_signature where id=le_id for update;
 if a.etape='archive' then return true;end if;
 if s.revision is distinct from la_revision then return false;end if;
 if a.etape<>'en_cours' or a.valide_le is null or s.etat<>'done' or s.anomalie or s.rapproche_le is null or a.operation is not null
 or a.document_fournisseur is null or a.signataire_fournisseur is null or a.conserver_jusqu_au<=clock_timestamp()
 or (select count(*) from public.fichiers_signature where acte_id=le_id and nature in ('acte','preuve') and confirme)<>2 then return false;end if;
 update public.actes_signature set etape='archive',archive_le=clock_timestamp() where id=le_id;
 -- Une signature sandbox ne produit jamais une creance reelle.
 if s.environnement='production' then update public.dossiers set statut='signe' where id=s.dossier_id;end if;
 insert into public.journal_signatures(acte_id,action) values(le_id,'archive');
 return true;
end;$$;

revoke all on function public.preparer_acte_signature(uuid,uuid,text,text,bigint,text,bytea,bytea,timestamptz,timestamptz),public.lire_acte_signature(uuid),public.actes_du_dossier(uuid),public.valider_acte_signature(uuid,text,boolean),public.journaliser_lecture_acte(uuid),public.charger_acte_signature(uuid),public.reserver_fichier_signature(uuid,text,text,integer,bytea),public.confirmer_fichier_signature(uuid),public.reserver_operation_acte(uuid,text),public.confirmer_operation_acte(uuid,uuid,text,uuid),public.actes_a_traiter(text),public.publier_archive_signature(uuid,bigint) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
grant execute on function public.preparer_acte_signature(uuid,uuid,text,text,bigint,text,bytea,bytea,timestamptz,timestamptz) to authenticated;
grant execute on function public.lire_acte_signature(uuid),public.actes_du_dossier(uuid),public.journaliser_lecture_acte(uuid) to authenticated,porteur_lien;
grant execute on function public.valider_acte_signature(uuid,text,boolean) to porteur_lien;
grant execute on function public.charger_acte_signature(uuid),public.reserver_fichier_signature(uuid,text,text,integer,bytea),public.confirmer_fichier_signature(uuid),public.reserver_operation_acte(uuid,text),public.confirmer_operation_acte(uuid,uuid,text,uuid),public.actes_a_traiter(text),public.publier_archive_signature(uuid,bigint) to serveur;

-- Effacement cryptographique a l'echeance, puis suppression physique reprenable.
alter table public.actes_signature alter column cle_scellee drop not null, alter column contexte_chiffre drop not null;
create table public.archives_signature_a_supprimer(chemin text primary key,cree_le timestamptz not null default clock_timestamp());
alter table public.archives_signature_a_supprimer enable row level security;
revoke all on public.archives_signature_a_supprimer from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
create function public.expirer_archives_signature() returns integer language plpgsql security definer set search_path='' as $$
declare a record; n integer:=0;
begin
 for a in select x.id from public.actes_signature x join public.demandes_signature s on s.id=x.id
 left join public.dossiers d on d.id=s.dossier_id
 where x.cle_scellee is not null and (x.conserver_jusqu_au<=clock_timestamp() or (x.etape<>'archive' and (d.id is null or d.expire_le<=clock_timestamp() or (x.expire_signature<=clock_timestamp() and x.etape in ('preparation','a_valider','refuse')) or (x.expire_signature<clock_timestamp()-interval '7 days' and s.etat in ('expired','declined','rejected','canceled','deleted')))))
 order by x.id for update of x skip locked limit 10 loop
  insert into public.archives_signature_a_supprimer(chemin)
   select o.name from storage.objects o where o.bucket_id='actes' and o.name like a.id::text||'/%'
   union select f.acte_id::text||'/'||f.id::text from public.fichiers_signature f where f.acte_id=a.id on conflict do nothing;
  update public.actes_signature set cle_scellee=null,contexte_chiffre=null,conserver_jusqu_au=least(conserver_jusqu_au,clock_timestamp()) where id=a.id;
  n:=n+1;
 end loop;
 return n;
end;$$;
-- La conservation ne peut pas etre raccourcie sous expiration avec l'ancien check.
alter table public.actes_signature drop constraint actes_signature_check;
alter table public.actes_signature add constraint conservation_acte check(cle_scellee is null or conserver_jusqu_au>expire_signature);
create function public.fichiers_archives_a_supprimer() returns setof text language sql stable security definer set search_path='' as $$
 select chemin from public.archives_signature_a_supprimer where cree_le<clock_timestamp()-interval '10 minutes' order by cree_le,chemin limit 10;
$$;
create function public.acquitter_suppression_archive(le_chemin text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from storage.objects where bucket_id='actes' and name=le_chemin) then return false;end if;
 delete from public.archives_signature_a_supprimer where chemin=le_chemin and cree_le<clock_timestamp()-interval '10 minutes';
 return found;
end;$$;
create function public.archive_en_suppression(le_chemin text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.archives_signature_a_supprimer where chemin=le_chemin);
$$;
revoke all on function public.expirer_archives_signature(),public.fichiers_archives_a_supprimer(),public.acquitter_suppression_archive(text),public.archive_en_suppression(text) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
grant execute on function public.expirer_archives_signature(),public.fichiers_archives_a_supprimer(),public.acquitter_suppression_archive(text),public.archive_en_suppression(text) to serveur;
create policy "Suppression archives expirees" on storage.objects for delete to serveur using(bucket_id='actes' and public.archive_en_suppression(name));
create policy "Lecture archives en suppression" on storage.objects for select to serveur using(bucket_id='actes' and public.archive_en_suppression(name));

create function public.proteger_dossier_en_signature() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.statut='transmis' and new.statut not in ('transmis','signe','expire') and exists(
 select 1 from public.actes_signature a join public.demandes_signature s on s.id=a.id
 where s.dossier_id=old.id and a.etape not in ('refuse','archive') and s.etat not in ('canceled','declined','rejected','deleted','expired') and a.expire_signature>clock_timestamp()) then
 raise exception 'Un acte est en cours de validation ou de signature.' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function public.proteger_dossier_en_signature() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
create trigger dossier_en_signature before update of statut on public.dossiers for each row execute function public.proteger_dossier_en_signature();
create function public.operations_actes_a_examiner() returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.actes_signature a where a.cle_scellee is not null and
 ((a.operation is not null and a.operation_jusqu_au<=clock_timestamp()) or a.etape='incertain');
$$;
revoke all on function public.operations_actes_a_examiner() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
grant execute on function public.operations_actes_a_examiner() to serveur;
create function public.archives_de_mon_agence(avant uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(t),'[]'::jsonb) from (select a.id,a.modele,a.archive_le,a.conserver_jusqu_au,s.environnement
 from public.actes_signature a join public.demandes_signature s on s.id=a.id where a.etape='archive' and a.agence_id=public.agence_courante()
 and public.acte_signature_accessible(a.id) and (avant is null or (a.archive_le,a.id)<(select x.archive_le,x.id from public.actes_signature x where x.id=avant and x.agence_id=public.agence_courante())) order by a.archive_le desc,a.id desc limit 20) t;
$$;
revoke all on function public.archives_de_mon_agence(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role,archive_signature;
grant execute on function public.archives_de_mon_agence(uuid) to authenticated;
