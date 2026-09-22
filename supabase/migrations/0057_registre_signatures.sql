-- Registre technique minimal : ni document, ni identite, ni lien de signature.
create table public.demandes_signature (
 id uuid primary key default gen_random_uuid(),
 dossier_id uuid references public.dossiers(id) on delete set null,
 source_dossier uuid not null,
 environnement text not null check(environnement in ('sandbox','production')),
 empreinte_acte text not null check(empreinte_acte ~ '^[0-9a-f]{64}$'),
 reference_fournisseur uuid,
 etat text not null default 'draft' check(etat in ('draft','approval','ongoing','paused','rejected','declined','canceled','expired','deleted','done')),
 revision bigint not null default 0,
 rapproche_le timestamptz,
 prochaine_lecture timestamptz not null default clock_timestamp(),
 bail uuid,
 bail_jusqu_au timestamptz,
 echecs integer not null default 0 check(echecs between 0 and 100),
 anomalie boolean not null default false,
 cree_le timestamptz not null default clock_timestamp(),
 unique(environnement,reference_fournisseur),
 unique(environnement,source_dossier,empreinte_acte)
);
create index demandes_signature_file on public.demandes_signature(environnement,prochaine_lecture)
 where reference_fournisseur is not null and not anomalie;
create table public.evenements_signature (
 environnement text not null check(environnement in ('sandbox','production')),
 id uuid not null,
 reference_fournisseur uuid not null,
 etat text not null check(etat in ('draft','approval','ongoing','paused','rejected','declined','canceled','expired','deleted','done')),
 survenu_le timestamptz not null,
 recu_le timestamptz not null default clock_timestamp(),
 anomalie boolean not null default false,
 primary key(environnement,id)
);
create index evenements_signature_reference on public.evenements_signature(environnement,reference_fournisseur);
alter table public.demandes_signature enable row level security;
alter table public.evenements_signature enable row level security;
revoke all on public.demandes_signature,public.evenements_signature from public,anon,authenticated,porteur_lien,depot_piece,serveur,service_role;

-- A appeler avant le premier POST fournisseur ; le retour existant interdit de recreer.
create function public.preparer_demande_signature(le_dossier uuid,le_mode text,empreinte text)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare d public.dossiers; precedente public.demandes_signature; nouvelle uuid;
begin
 if le_dossier is null or le_mode is null or le_mode not in ('sandbox','production') or empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then raise exception 'Preparation signature invalide';end if;
 select * into d from public.dossiers where id=le_dossier for update;
 if not found or d.demonstration or d.statut<>'transmis' or d.expire_le<=clock_timestamp() then return null;end if;
 select * into precedente from public.demandes_signature s where s.environnement=le_mode and s.source_dossier=le_dossier and s.empreinte_acte=empreinte;
 if found then return jsonb_build_object('id',precedente.id,'nouvelle',false);end if;
 -- Un autre acte sur ce dossier exige une resolution explicite du precedent.
 if exists(select 1 from public.demandes_signature s where s.source_dossier=le_dossier and s.environnement=le_mode and s.etat not in ('canceled','declined','rejected','deleted','expired')) then return null;end if;
 insert into public.demandes_signature(dossier_id,source_dossier,environnement,empreinte_acte)
 values(le_dossier,le_dossier,le_mode,empreinte) returning id into nouvelle;
 return jsonb_build_object('id',nouvelle,'nouvelle',true);
end;$$;

create function public.rattacher_demande_signature(la_demande uuid,la_reference uuid,le_mode text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.demandes_signature;
begin
 if la_demande is null or la_reference is null or le_mode is null or le_mode not in ('sandbox','production') then return false;end if;
 select * into d from public.demandes_signature where id=la_demande and environnement=le_mode for update;
 if not found or d.dossier_id is null or d.anomalie then return false;end if;
 if exists(select 1 from public.evenements_signature e where e.environnement=le_mode and e.reference_fournisseur=la_reference and e.anomalie) then
  update public.demandes_signature set anomalie=true where id=la_demande;
  return false;
 end if;
 if d.reference_fournisseur is not null then return d.reference_fournisseur=la_reference;end if;
 update public.demandes_signature set reference_fournisseur=la_reference,revision=revision+1,prochaine_lecture=clock_timestamp() where id=la_demande;
 return true;
end;$$;

create function public.enregistrer_evenement_signature(le_mode text,evenement uuid,la_reference uuid,le_statut text,survenu timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare precedent public.evenements_signature; conflit boolean;
begin
 if le_mode is null or le_mode not in ('sandbox','production') or evenement is null or la_reference is null or le_statut is null or le_statut not in ('draft','approval','ongoing','paused','rejected','declined','canceled','expired','deleted','done') or survenu is null or not isfinite(survenu) or survenu<'2000-01-01'::timestamptz or survenu>clock_timestamp()+interval '5 minutes' then raise exception 'Notification signature invalide';end if;
 -- Serialise aussi les nouvelles insertions ; ne verrouille jamais un dossier.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(le_mode||evenement::text,0));
 select * into precedent from public.evenements_signature where environnement=le_mode and id=evenement;
 if found then
  conflit:=precedent.reference_fournisseur<>la_reference or precedent.etat<>le_statut or precedent.survenu_le<>survenu;
  if conflit then
   update public.evenements_signature set anomalie=true where environnement=le_mode and id=evenement;
   update public.demandes_signature set anomalie=true,revision=revision+1 where environnement=le_mode and reference_fournisseur in (la_reference,precedent.reference_fournisseur);
  end if;
  return jsonb_build_object('enregistre',true,'anomalie',conflit or precedent.anomalie);
 end if;
 insert into public.evenements_signature(environnement,id,reference_fournisseur,etat,survenu_le) values(le_mode,evenement,la_reference,le_statut,survenu);
 -- L'evenement reveille une lecture, il ne change jamais l'etat du dossier.
 update public.demandes_signature set revision=revision+1,prochaine_lecture=clock_timestamp()
 where environnement=le_mode and reference_fournisseur=la_reference;
 return jsonb_build_object('enregistre',true,'anomalie',false);
end;$$;

create function public.reserver_signatures_a_rapprocher(le_mode text)
returns table(id uuid,reference_fournisseur uuid,revision bigint,bail uuid)
language plpgsql security definer set search_path='' as $$
begin
 if le_mode is null or le_mode not in ('sandbox','production') then raise exception 'Environnement signature invalide';end if;
 return query with selection as (
  select s.id from public.demandes_signature s where s.environnement=le_mode
  and s.dossier_id is not null and s.reference_fournisseur is not null and not s.anomalie
  and s.prochaine_lecture<=clock_timestamp() and (s.bail_jusqu_au is null or s.bail_jusqu_au<=clock_timestamp())
  order by s.prochaine_lecture,s.id for update skip locked limit 2
 ) update public.demandes_signature s set bail=gen_random_uuid(),bail_jusqu_au=clock_timestamp()+interval '2 minutes'
 from selection where s.id=selection.id returning s.id,s.reference_fournisseur,s.revision,s.bail;
end;$$;

create function public.confirmer_rapprochement_signature(la_demande uuid,le_mode text,le_bail uuid,la_revision bigint,la_reference uuid,reference_externe uuid,le_statut text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.demandes_signature; conflit boolean;
begin
 if le_statut is null or le_statut not in ('draft','approval','ongoing','paused','rejected','declined','canceled','expired','deleted','done') then return false;end if;
 select * into d from public.demandes_signature where id=la_demande and environnement=le_mode for update;
 if not found or d.dossier_id is null or d.anomalie or le_bail is null or d.bail is distinct from le_bail or d.bail_jusqu_au<=clock_timestamp() then return false;end if;
 if d.revision is distinct from la_revision then
  update public.demandes_signature set bail=null,bail_jusqu_au=null,prochaine_lecture=clock_timestamp() where id=la_demande;
  return false;
 end if;
 conflit:=d.reference_fournisseur is distinct from la_reference or reference_externe is distinct from d.id
  or (d.etat='done' and le_statut not in ('done','deleted'))
  or (d.etat='canceled' and le_statut not in ('canceled','deleted'));
 update public.demandes_signature set anomalie=conflit,etat=case when conflit then d.etat else le_statut end,
  rapproche_le=case when conflit then d.rapproche_le else clock_timestamp() end,
  prochaine_lecture=clock_timestamp()+case when le_statut in ('done','canceled','declined','rejected','deleted') then interval '1 day' else interval '15 minutes' end,
  bail=null,bail_jusqu_au=null,echecs=0 where id=la_demande;
 -- Aucun changement de dossiers.statut ni de facture : les archives restent a confirmer.
 return not conflit;
end;$$;

create function public.echec_rapprochement_signature(la_demande uuid,le_mode text,le_bail uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.demandes_signature set bail=null,bail_jusqu_au=null,echecs=least(echecs+1,100),
 prochaine_lecture=clock_timestamp()+make_interval(secs=>least(900,30*(echecs+1)))
 where id=la_demande and environnement=le_mode and bail=le_bail and bail_jusqu_au>clock_timestamp();
 return found;
end;$$;

revoke all on function public.preparer_demande_signature(uuid,text,text),public.rattacher_demande_signature(uuid,uuid,text),public.enregistrer_evenement_signature(text,uuid,uuid,text,timestamptz),public.reserver_signatures_a_rapprocher(text),public.confirmer_rapprochement_signature(uuid,text,uuid,bigint,uuid,uuid,text),public.echec_rapprochement_signature(uuid,text,uuid) from public,anon,authenticated,porteur_lien,depot_piece,serveur,service_role;
grant execute on function public.preparer_demande_signature(uuid,text,text),public.rattacher_demande_signature(uuid,uuid,text),public.enregistrer_evenement_signature(text,uuid,uuid,text,timestamptz),public.reserver_signatures_a_rapprocher(text),public.confirmer_rapprochement_signature(uuid,text,uuid,bigint,uuid,uuid,text),public.echec_rapprochement_signature(uuid,text,uuid) to serveur;

create function public.signatures_a_examiner(le_mode text)
returns integer language sql security definer set search_path='' as $$
 select (select count(*) from public.demandes_signature s where s.environnement=le_mode and
  (s.anomalie or (s.dossier_id is not null and s.reference_fournisseur is null and s.cree_le<clock_timestamp()-interval '1 hour')))
 + (select count(*) from public.evenements_signature e where e.environnement=le_mode and
  (e.anomalie or (e.recu_le<clock_timestamp()-interval '1 hour' and not exists(select 1 from public.demandes_signature s where s.environnement=e.environnement and s.reference_fournisseur=e.reference_fournisseur))))
 ::integer;
$$;
revoke all on function public.signatures_a_examiner(text) from public,anon,authenticated,porteur_lien,depot_piece,serveur,service_role;
grant execute on function public.signatures_a_examiner(text) to serveur;
