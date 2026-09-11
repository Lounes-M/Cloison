-- Suivi administratif prive : aucune piece, correspondance ou identite copiee.
create table public.suivi_demandes_droits (
 operation uuid primary key,
 demande uuid not null,
 precedente uuid unique,
 operateur uuid not null,
 nature text not null check(nature in ('acces','rectification','effacement','opposition','limitation','portabilite')),
 etat text not null check(etat in ('recue','identite_a_verifier','en_cours','repondu','clos')),
 recu_le timestamptz not null,
 repondre_avant timestamptz not null,
 effacer_le timestamptz not null,
 preuve_sha256 text not null check(preuve_sha256 ~ '^[a-f0-9]{64}$'),
 compte_base name not null default session_user,
 inscrit_le timestamptz not null default clock_timestamp(),
 unique(operation,demande),
 foreign key(precedente,demande) references public.suivi_demandes_droits(operation,demande) on delete cascade,
 check(isfinite(recu_le) and isfinite(repondre_avant) and isfinite(effacer_le)),
 check(extract(epoch from recu_le)>=0 and repondre_avant>=recu_le and effacer_le>=repondre_avant),
 check(precedente is null or precedente<>operation)
);
create unique index droits_premiere_etape on public.suivi_demandes_droits(demande) where precedente is null;
create index droits_demande_date on public.suivi_demandes_droits(demande,inscrit_le,operation);
create index droits_echeance on public.suivi_demandes_droits(repondre_avant,demande);
create index droits_effacement on public.suivi_demandes_droits(effacer_le,demande);
alter table public.suivi_demandes_droits enable row level security;
revoke all on public.suivi_demandes_droits from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;

create function public.proteger_suivi_droits() returns trigger
language plpgsql set search_path='' as $$
declare avant public.suivi_demandes_droits;existant public.suivi_demandes_droits;
begin
 if tg_op='DELETE' then
  if current_setting('cloison.purge_droits',true)='active' then return old;end if;
  raise exception 'Suppression reservee a la retention';
 end if;
 if tg_op<>'INSERT' then raise exception 'Etape administrative immuable';end if;
 -- Une seule suite par demande, y compris avec deux operateurs simultanes.
 perform pg_advisory_xact_lock(hashtextextended(new.demande::text,5353));
 select * into existant from public.suivi_demandes_droits where operation=new.operation;
 if found then
  if row(existant.demande,existant.precedente,existant.operateur,existant.nature,existant.etat,existant.recu_le,existant.repondre_avant,existant.effacer_le,existant.preuve_sha256,existant.compte_base)
   is distinct from row(new.demande,new.precedente,new.operateur,new.nature,new.etat,new.recu_le,new.repondre_avant,new.effacer_le,new.preuve_sha256,session_user) then
   raise exception 'Operation administrative divergente';
  end if;
  return new;
 end if;
 if new.recu_le>clock_timestamp()+interval '5 minutes' or new.effacer_le<=clock_timestamp() then
  raise exception 'Dates administratives invalides';
 end if;
 if (select count(*) from public.suivi_demandes_droits where demande=new.demande)>=100 then
  raise exception 'Historique administratif trop volumineux';
 end if;
 if new.precedente is null then
  if new.etat<>'recue' then raise exception 'La premiere etape est une reception';end if;
 else
  select * into avant from public.suivi_demandes_droits where operation=new.precedente and demande=new.demande;
  if not found or exists(select 1 from public.suivi_demandes_droits where precedente=new.precedente) then
   raise exception 'Revision administrative obsolete';
  end if;
  if avant.effacer_le<=clock_timestamp() then raise exception 'Suivi arrive a echeance';end if;
  if avant.nature is distinct from new.nature or avant.recu_le is distinct from new.recu_le then
   raise exception 'Reception administrative immuable';
  end if;
  if avant.etat='clos' or new.etat='recue' or (new.etat='clos' and avant.etat<>'repondu')
   or (avant.etat='repondu' and new.etat<>'clos') then raise exception 'Transition administrative invalide';end if;
 end if;
 new.compte_base:=session_user;new.inscrit_le:=clock_timestamp();
 return new;
end;$$;
revoke all on function public.proteger_suivi_droits() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger droits_etapes_immuables before insert or update or delete on public.suivi_demandes_droits
 for each row execute function public.proteger_suivi_droits();

create function public.purger_suivis_droits() returns integer
language plpgsql security definer set search_path='' as $$
declare cible record;nombre integer:=0;ancienne text:=current_setting('cloison.purge_droits',true);
begin
 -- L'echeance de la derniere etape decide de toute la chaine, pas celle d'une ancienne etape.
 for cible in select s.demande from public.suivi_demandes_droits s
  where s.effacer_le<=clock_timestamp() and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)
  order by s.effacer_le,s.demande limit 100 loop
  perform pg_advisory_xact_lock(hashtextextended(cible.demande::text,5353));
  if exists(select 1 from public.suivi_demandes_droits s where s.demande=cible.demande and s.effacer_le<=clock_timestamp()
   and not exists(select 1 from public.suivi_demandes_droits n where n.precedente=s.operation)) then
   perform set_config('cloison.purge_droits','active',true);
   delete from public.suivi_demandes_droits where demande=cible.demande;
   nombre:=nombre+1;
  end if;
 end loop;
 perform set_config('cloison.purge_droits',coalesce(ancienne,''),true);
 return nombre;
end;$$;
revoke all on function public.purger_suivis_droits() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.purger_suivis_droits() to serveur;
notify pgrst,'reload schema';
