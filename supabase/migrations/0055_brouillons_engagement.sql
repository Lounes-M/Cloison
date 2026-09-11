-- Brouillon prive du garant, distinct de la declaration et de la mention.
create table public.brouillons_engagement (
 dossier_id uuid primary key references public.dossiers(id) on delete cascade,
 revision uuid not null default gen_random_uuid(),
 version_conditions integer not null check(version_conditions>=0),
 chiffre bytea check(chiffre is null or octet_length(chiffre) between 29 and 4096),
 expire_le timestamptz not null default (clock_timestamp()+interval '7 days')
);
alter table public.brouillons_engagement enable row level security;
revoke all on public.brouillons_engagement from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create index brouillons_engagement_expiration on public.brouillons_engagement(expire_le);

create function public.mon_brouillon_engagement()
returns table(revision uuid,version_conditions integer,chiffre bytea,expire_le timestamptz)
language sql stable security definer set search_path='' as $$
 select b.revision,b.version_conditions,b.chiffre,least(b.expire_le,d.expire_le)
 from public.brouillons_engagement b join public.dossiers d on d.id=b.dossier_id
 where d.id=public.dossier_courant() and public.partie_courante()='garant'
 and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
 and d.expire_le>clock_timestamp() and b.expire_le>clock_timestamp()
 and b.version_conditions=coalesce((select e.version_conditions from public.engagements e where e.dossier_id=d.id),0);
$$;

create function public.sauver_brouillon_engagement(le_chiffre bytea,la_version integer,revision_attendue uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers; courante uuid; resultat uuid;
begin
 if public.partie_courante() is distinct from 'garant' or la_version is null or la_version<0
 or (le_chiffre is not null and octet_length(le_chiffre) not between 29 and 4096) then return null;end if;
 select * into d from public.dossiers where id=public.dossier_courant() for update;
 if not found or d.expire_le<=clock_timestamp() or d.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then return null;end if;
 perform 1 from public.jetons_actifs j where j.dossier_id=d.id and j.partie='garant'
 and j.jti=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'jti')::uuid
 and j.expire_le>clock_timestamp() for share;
 if not found then return null;end if;
 if la_version<>coalesce((select e.version_conditions from public.engagements e where e.dossier_id=d.id),0) then return null;end if;
 delete from public.brouillons_engagement where dossier_id=d.id and expire_le<=clock_timestamp();
 select revision into courante from public.brouillons_engagement where dossier_id=d.id;
 if courante is distinct from revision_attendue then return null;end if;
 insert into public.brouillons_engagement(dossier_id,version_conditions,chiffre,expire_le)
 values(d.id,la_version,le_chiffre,least(d.expire_le,clock_timestamp()+interval '7 days'))
 on conflict(dossier_id) do update set chiffre=excluded.chiffre,revision=gen_random_uuid(),version_conditions=excluded.version_conditions
 returning revision into resultat;
 return resultat;
end;$$;

create function public.invalider_brouillon_engagement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='dossiers' then
  if new.email_garant is distinct from old.email_garant or new.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then
   delete from public.brouillons_engagement where dossier_id=new.id;
  end if;
 elsif tg_op='INSERT' or new.version_conditions is distinct from old.version_conditions then
  delete from public.brouillons_engagement where dossier_id=new.dossier_id;
 end if;
 return new;
end;$$;
create trigger invalider_brouillon_dossier after update on public.dossiers for each row execute function public.invalider_brouillon_engagement();
create trigger invalider_brouillon_conditions after insert or update on public.engagements for each row execute function public.invalider_brouillon_engagement();

create function public.purger_brouillons_engagement() returns integer
language plpgsql security definer set search_path='' as $$
declare nombre integer;
begin
 delete from public.brouillons_engagement where dossier_id in (
 select b.dossier_id from public.brouillons_engagement b join public.dossiers d on d.id=b.dossier_id
 where b.expire_le<=clock_timestamp() or d.expire_le<=clock_timestamp()
 order by b.expire_le,b.dossier_id limit 1000);
 get diagnostics nombre=row_count;return nombre;
end;$$;
revoke all on function public.mon_brouillon_engagement(),public.sauver_brouillon_engagement(bytea,integer,uuid),public.invalider_brouillon_engagement(),public.purger_brouillons_engagement() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.mon_brouillon_engagement(),public.sauver_brouillon_engagement(bytea,integer,uuid) to porteur_lien;
grant execute on function public.purger_brouillons_engagement() to serveur;
notify pgrst,'reload schema';
