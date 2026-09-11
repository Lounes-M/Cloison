begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"4300d315a25590f6079b18fd3563f721deb70017295366321b4bbe6708c210dc","indexes":"346e5df875cedd7f48664b57eb6855d06eb2dc37be696ca4de1370a900d13020","colonnes":"a1ee2eee92ffd0e13da1a42445dea0ca09f033a59a5c6d08923aa65e95d46115","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"d643cb572bbfe52e6b8fc8711d1fbafe4bfb3a3bb51754df744040afdc7d5039","politiques":"fc1958c0a80a7d386f5629e970e73384300f3f60e3828c1bc8bf7b7a02d2cd1b","contraintes":"9060ee723f8506143dbc9430dfc8f55066d3d9ff88b6dc5c375551973dffdcd9","declencheurs":"062180489eae51d4ad4960568da19cb33eaa0d83611743335ce596dfc9ede731"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
-- Traces d'affectation internes, sans recopier nom ou adresse de collaborateur.
create table public.historique_responsables (
 id uuid primary key default gen_random_uuid(),
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 revision uuid not null,
 precedent uuid,
 suivant uuid,
 auteur uuid,
 quand timestamptz not null default clock_timestamp(),
 unique(dossier_id,revision),
 check(precedent is distinct from suivant)
);
create index historique_responsables_page on public.historique_responsables(dossier_id,quand desc,id desc);
alter table public.historique_responsables enable row level security;
revoke all on public.historique_responsables from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;

create function public.proteger_historique_responsables() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.dossiers where id=old.dossier_id and expire_le>clock_timestamp()) then return old;end if;
 raise exception 'Historique des responsables immuable';
end;$$;
revoke all on function public.proteger_historique_responsables() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger historique_responsables_immuable before update or delete on public.historique_responsables
 for each row execute function public.proteger_historique_responsables();

create function public.tracer_affectation() returns trigger
language plpgsql security definer set search_path='' as $$
declare avant uuid;
begin
 if tg_op='UPDATE' then avant:=old.membre_id;end if;
 if avant is not distinct from new.membre_id then return new;end if;
 insert into public.historique_responsables(dossier_id,revision,precedent,suivant,auteur)
 select d.id,new.revision,avant,new.membre_id,
  case when exists(select 1 from public.membres_agence m where m.agence_id=d.agence_id and m.utilisateur_id=auth.uid()) then auth.uid() else null end
 from public.dossiers d where d.id=new.dossier_id and d.expire_le>clock_timestamp();
 return new;
end;$$;
revoke all on function public.tracer_affectation() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger tracer_responsable after insert or update on public.affectations_dossiers
 for each row execute function public.tracer_affectation();

create function public.historique_responsables_du_dossier(le_dossier uuid,avant_quand timestamptz default null,avant_id uuid default null)
returns table(id uuid,quand text,precedent uuid,precedent_email text,suivant uuid,suivant_email text,auteur uuid,auteur_email text)
language sql stable security definer set search_path='' as $$
 select h.id,to_char(h.quand at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),h.precedent,up.email::text,h.suivant,us.email::text,h.auteur,ua.email::text
 from public.historique_responsables h join public.dossiers d on d.id=h.dossier_id join public.agences a on a.id=d.agence_id
 left join public.membres_agence mp on mp.utilisateur_id=h.precedent and mp.agence_id=d.agence_id
 left join auth.users up on up.id=mp.utilisateur_id and up.email_confirmed_at is not null and lower(split_part(up.email,'@',2))=a.domaine
 left join public.membres_agence ms on ms.utilisateur_id=h.suivant and ms.agence_id=d.agence_id
 left join auth.users us on us.id=ms.utilisateur_id and us.email_confirmed_at is not null and lower(split_part(us.email,'@',2))=a.domaine
 left join public.membres_agence ma on ma.utilisateur_id=h.auteur and ma.agence_id=d.agence_id
 left join auth.users ua on ua.id=ma.utilisateur_id and ua.email_confirmed_at is not null and lower(split_part(ua.email,'@',2))=a.domaine
 where d.id=le_dossier and d.agence_id=public.agence_courante() and d.expire_le>clock_timestamp() and d.statut<>'expire'
 and ((avant_quand is null and avant_id is null) or (isfinite(avant_quand) and avant_id is not null and (h.quand,h.id)<(avant_quand,avant_id)))
 order by h.quand desc,h.id desc limit 51;
$$;
revoke all on function public.historique_responsables_du_dossier(uuid,timestamptz,uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.historique_responsables_du_dossier(uuid,timestamptz,uuid) to authenticated;

create function public.purger_historique_responsables() returns integer
language plpgsql security definer set search_path='' as $$
declare nombre integer;
begin
 delete from public.historique_responsables h using (
  select h2.id from public.historique_responsables h2 join public.dossiers d on d.id=h2.dossier_id
  where d.expire_le<=clock_timestamp() order by d.expire_le,h2.id limit 1000
 ) c where h.id=c.id;
 get diagnostics nombre=row_count;
 return nombre;
end;$$;
revoke all on function public.purger_historique_responsables() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.purger_historique_responsables() to serveur;
notify pgrst,'reload schema';

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"11bb47cc3193515b4962b4af9b2b3fe2f87f40370a8533673c10b1ff9ae35c65","indexes":"807c738cb5e81f206f0e5d97cf08877dfff7b33a3f332ab24c50b3be069302f6","colonnes":"12479df8dfbab1004fdde90c3d39761f6e477a98357536c7e80a056193ed8743","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"007cdd54822fc74af2499c9ed7f31f9d65c47292f04fd6fe42f622e50e2877d9","politiques":"fc1958c0a80a7d386f5629e970e73384300f3f60e3828c1bc8bf7b7a02d2cd1b","contraintes":"fc084097e543a0a10a9c5561afb752f578068a1bdd967ac561e5a6fa3912d3c8","declencheurs":"a2e6fac1d2d6730c247a1e048759bea5c4fc9800e34565274b90cc344a61990e"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
