begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"ac66f0d270f636adc0e34db1a3c473a5d3f1143011190f7cefeb89ac6819cb6d","indexes":"f14d5873a8c252c82c8aae617c9e11571dc70eccc95d2c5ff3d71618d7be543f","colonnes":"6fb07f10fd8421a3efbf9af268540bba43cb89c8dd729a089c1697ceeca7262b","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"c1f5cf649cfa3fc7bb70e6fcb28a52f55a2e44fd349f159f5d22eafb3e6a147f","politiques":"d3df550bb38e995b62099e6c7b52b0ca5c7c2c098fa3a3128a75e89a7ae407cb","contraintes":"e84652bf1b82527474e3bf293f85732bd0c098ba3cd89869dd7e2ac959cd9a09","declencheurs":"7962e56c190680ea80923b0b426cb5ecfa2008e88fcb9d848d63a5224dfe2889"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
-- Rappels facultatifs, sans prolongation ni renouvellement de lien.
create table public.reglages_rappels (
 agence_id uuid primary key references public.agences(id) on delete cascade,
 relance_jours smallint not null default 0 check(relance_jours in (0,3,7,14)),
 echeance_jours smallint not null default 0 check(echeance_jours in (0,3,7)),
 revision uuid not null default gen_random_uuid()
);
alter table public.reglages_rappels enable row level security;
revoke all on public.reglages_rappels from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant select on public.reglages_rappels to authenticated;
create policy "Admin lit les rappels" on public.reglages_rappels for select to authenticated using (
 agence_id=public.agence_courante() and public.est_admin_agence()
);
create function public.reglages_rappels_agence()
returns table(relance_jours smallint,echeance_jours smallint,revision uuid)
language sql stable security definer set search_path='' as $$
 select coalesce(r.relance_jours,0)::smallint,coalesce(r.echeance_jours,0)::smallint,r.revision
 from public.agences a left join public.reglages_rappels r on r.agence_id=a.id
 where a.id=public.agence_courante() and public.est_admin_agence();
$$;
create function public.regler_rappels(relance integer,echeance integer,revision_attendue uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();courante uuid;resultat uuid;
begin
 if agence is null or not public.est_admin_agence() or relance is null or relance not in (0,3,7,14)
 or echeance is null or echeance not in (0,3,7) then return null;end if;
 perform 1 from public.agences where id=agence for update;
 select revision into courante from public.reglages_rappels where agence_id=agence;
 if courante is distinct from revision_attendue then return null;end if;
 -- Reverifier la session apres l'attente du verrou.
 if agence is distinct from public.agence_courante() or not public.est_admin_agence() then return null;end if;
 insert into public.reglages_rappels(agence_id,relance_jours,echeance_jours)
 values(agence,relance,echeance) on conflict(agence_id) do update
 set relance_jours=excluded.relance_jours,echeance_jours=excluded.echeance_jours,revision=gen_random_uuid()
 returning revision into resultat;
 return resultat;
end;$$;
revoke all on function public.reglages_rappels_agence(),public.regler_rappels(integer,integer,uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.reglages_rappels_agence(),public.regler_rappels(integer,integer,uuid) to authenticated;

-- Les dossiers existants repartent d'une date recente, sans rattrapage massif.
alter table public.dossiers add column activite_rappel_le timestamptz not null default clock_timestamp(),
 add column revision_rappel uuid not null default gen_random_uuid();
create function public.actualiser_activite_rappel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='dossiers' then
  if new.statut is distinct from old.statut or new.email_garant is distinct from old.email_garant or new.agence_id is distinct from old.agence_id then
   new.activite_rappel_le:=clock_timestamp();new.revision_rappel:=gen_random_uuid();
  end if;
  return new;
 end if;
 update public.dossiers set activite_rappel_le=clock_timestamp(),revision_rappel=gen_random_uuid()
 where id=case when tg_op='DELETE' then old.dossier_id else new.dossier_id end;
 return null;
end;$$;
revoke all on function public.actualiser_activite_rappel() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger activite_rappel_dossier before update on public.dossiers for each row execute function public.actualiser_activite_rappel();
create trigger activite_rappel_piece after insert or update or delete on public.pieces for each row execute function public.actualiser_activite_rappel();
create trigger activite_rappel_engagement after insert or update or delete on public.engagements for each row execute function public.actualiser_activite_rappel();
create trigger activite_rappel_complement after insert or update or delete on public.complements_documentaires for each row execute function public.actualiser_activite_rappel();

create table public.rappels_dossiers (
 id uuid primary key default gen_random_uuid(),
 cle text not null unique check(cle ~ '^[0-9a-f]{64}$'),
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 agence_id uuid not null references public.agences(id) on delete cascade,
 nature text not null check(nature in ('depot','echeance')),
 membre_id uuid references auth.users(id) on delete set null,
 revision_dossier uuid not null,
 empreinte_email text not null check(empreinte_email ~ '^[0-9a-f]{64}$'),
 expiration_dossier timestamptz not null,
 expire_le timestamptz not null,
 cree_le timestamptz not null default clock_timestamp(),
 check(nature<>'depot' or membre_id is null)
);
create index rappels_dossier on public.rappels_dossiers(dossier_id,nature,cree_le);
create index rappels_agence_date on public.rappels_dossiers(agence_id,cree_le);
create index rappels_date on public.rappels_dossiers(cree_le);
alter table public.rappels_dossiers enable row level security;
revoke all on public.rappels_dossiers from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
alter table public.courriels_sortants add column rappel_id uuid references public.rappels_dossiers(id) on delete cascade,
 add constraint courriel_rappel_identique check(rappel_id is null or rappel_id=id);
create index courriels_rappel on public.courriels_sortants(rappel_id) where rappel_id is not null;

create function public.rappel_encore_valide(identifiant uuid) returns boolean
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
   and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id)))))));
$$;
revoke all on function public.rappel_encore_valide(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;

create function public.programmer_rappels() returns integer
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

create function public.rappels_a_preparer()
returns table(id uuid,dossier_id uuid,reference text,nature text,email text,expiration timestamptz)
language sql security definer set search_path='' as $$
 select r.id,d.id,d.reference,r.nature,case when r.nature='depot' then d.email_garant else u.email end,d.expire_le
 from public.rappels_dossiers r join public.dossiers d on d.id=r.dossier_id left join auth.users u on u.id=r.membre_id
 where public.rappel_encore_valide(r.id) and not exists(select 1 from public.courriels_sortants c where c.id=r.id)
 order by r.cree_le,r.id limit 20;
$$;
create function public.mettre_rappel_en_file(identifiant uuid,chiffre text) returns text
language plpgsql security definer set search_path='' as $$
begin
 if chiffre is null or length(chiffre) not between 1 and 32768 then return 'refuse';end if;
 perform 1 from public.rappels_dossiers where id=identifiant for update;
 if not found or not public.rappel_encore_valide(identifiant) then return 'obsolete';end if;
 insert into public.courriels_sortants(id,contenu,expire_le,rappel_id)
 select id,chiffre,expire_le,id from public.rappels_dossiers where id=identifiant on conflict(id) do nothing;
 return 'prepare';
end;$$;
revoke all on function public.programmer_rappels(),public.rappels_a_preparer(),public.mettre_rappel_en_file(uuid,text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.programmer_rappels(),public.rappels_a_preparer(),public.mettre_rappel_en_file(uuid,text) to serveur;

-- Meme contrat de bail, enrichi d'une reference optionnelle pour les rappels.
drop function public.prendre_courriels(uuid);
create function public.prendre_courriels(identifiant uuid default null)
returns table(id uuid,contenu text,bail uuid,rappel_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 update public.courriels_sortants c set contenu=null,annule_le=clock_timestamp(),a_reconcilier=false,bail=null,bail_expire_le=null
 where c.id in (select x.id from public.courriels_sortants x where x.rappel_id is not null and x.envoye_le is null and x.annule_le is null
  and not public.rappel_encore_valide(x.rappel_id) order by x.cree_le limit 500);
 update public.courriels_sortants c set a_reconcilier=true
 where c.envoye_le is null and c.annule_le is null and c.premier_essai<now()-interval '23 hours';
 return query with disponibles as (
  select c.id from public.courriels_sortants c
  where c.envoye_le is null and c.annule_le is null and not c.a_reconcilier and (c.expire_le is null or c.expire_le>clock_timestamp())
   and (c.rappel_id is null or public.rappel_encore_valide(c.rappel_id))
   and c.prochain_essai<=now() and (c.bail_expire_le is null or c.bail_expire_le<now())
   and (identifiant is null or c.id=identifiant)
  order by c.cree_le for update skip locked limit 10
 ) update public.courriels_sortants c set bail=gen_random_uuid(),bail_expire_le=now()+interval '5 minutes',
 premier_essai=coalesce(c.premier_essai,now()),essais=c.essais+1
 from disponibles d where c.id=d.id returning c.id,c.contenu,c.bail,c.rappel_id;
end;$$;
create function public.confirmer_rappel_avant_envoi(identifiant uuid,le_bail uuid) returns text
language plpgsql security definer set search_path='' as $$
declare c public.courriels_sortants;
begin
 select * into c from public.courriels_sortants where id=identifiant for update;
 if not found or c.rappel_id is null or c.envoye_le is not null then return 'refuse';end if;
 if c.annule_le is not null then return 'annule';end if;
 if le_bail is null or c.bail is distinct from le_bail or c.bail_expire_le is null or c.bail_expire_le<=clock_timestamp() then return 'refuse';end if;
 if not public.rappel_encore_valide(c.rappel_id) then
  update public.courriels_sortants set contenu=null,annule_le=clock_timestamp(),a_reconcilier=false,bail=null,bail_expire_le=null where id=identifiant;
  return 'annule';
 end if;
 return 'pret';
end;$$;
revoke all on function public.prendre_courriels(uuid),public.confirmer_rappel_avant_envoi(uuid,uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.prendre_courriels(uuid),public.confirmer_rappel_avant_envoi(uuid,uuid) to serveur;
notify pgrst,'reload schema';

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"04c048af7e5587e00633d48f8f28386506752ce2bab308c1e9de110cf30afad3","indexes":"cf8c673747732b9075a5dd2dd20cd0da7e5d416548c713f9ff78375192ac7909","colonnes":"86b3234b8ce8f3b80c7593dbb06a3addabca54bf3401ad3382304dd1d06798d2","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"88e5e0cea80b08fb7eaf8dfbc6f6bc1abc74eb03ca800d7f5110699bdb53c470","politiques":"fc1958c0a80a7d386f5629e970e73384300f3f60e3828c1bc8bf7b7a02d2cd1b","contraintes":"bce3d48d7e2544d7c36a85e90cf2f1487b0339afb5db8a88ab840e3bb1a26dcb","declencheurs":"45ad266b4b03d8036ce4cddefd21440e8fa4af9336d02034a256a52d4f3ce50d"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
