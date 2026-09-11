begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"11bb47cc3193515b4962b4af9b2b3fe2f87f40370a8533673c10b1ff9ae35c65","indexes":"807c738cb5e81f206f0e5d97cf08877dfff7b33a3f332ab24c50b3be069302f6","colonnes":"12479df8dfbab1004fdde90c3d39761f6e477a98357536c7e80a056193ed8743","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"007cdd54822fc74af2499c9ed7f31f9d65c47292f04fd6fe42f622e50e2877d9","politiques":"fc1958c0a80a7d386f5629e970e73384300f3f60e3828c1bc8bf7b7a02d2cd1b","contraintes":"fc084097e543a0a10a9c5561afb752f578068a1bdd967ac561e5a6fa3912d3c8","declencheurs":"a2e6fac1d2d6730c247a1e048759bea5c4fc9800e34565274b90cc344a61990e"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"12eb9f8cd81c18f18415a4379e14c8b044c4a942de46a0a0fbbc0b307e147f62","indexes":"22bf95eef8b9bed40519e00f453453a0314ac7fcf5764ab6714207f15236e451","colonnes":"3685fd15abc853d9936b59ef65fa3268cc233b6ca14af2ad419cfa5b535a542f","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"2d4354a2efdb20e9e33d375a57f45bf249a96e811ebb34acc7f6606f1d9fbd47","politiques":"fc1958c0a80a7d386f5629e970e73384300f3f60e3828c1bc8bf7b7a02d2cd1b","contraintes":"47ba7411c28bcd8b86667f705acc047dc112dfeed8c3ea23670ec024f5dc96a3","declencheurs":"dc31282e0ed93fdbcdddd82c68855d918a03d0b985d86df46c45018af226ed68"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
