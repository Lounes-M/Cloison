-- Organisation interne de l'agence, sans ouverture de nouveaux droits sur le coffre.
create table public.affectations_dossiers (
 dossier_id uuid primary key references public.dossiers(id) on delete cascade,
 membre_id uuid references auth.users(id) on delete set null,
 revision uuid not null default gen_random_uuid(),
 attribue_par uuid references auth.users(id) on delete set null,
 modifie_le timestamptz not null default clock_timestamp()
);
create index affectations_membre on public.affectations_dossiers(membre_id,dossier_id);
alter table public.affectations_dossiers enable row level security;
revoke all on public.affectations_dossiers from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant select on public.affectations_dossiers to authenticated;
create policy "Agence lit ses responsables" on public.affectations_dossiers for select to authenticated using (
 exists(select 1 from public.dossiers d where d.id=dossier_id and d.agence_id=public.agence_courante() and d.expire_le>clock_timestamp())
);

-- Une suppression Auth passant par une cle etrangere invalide aussi les formulaires.
create function public.versionner_affectation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.membre_id is distinct from old.membre_id then
  new.revision:=gen_random_uuid();new.modifie_le:=clock_timestamp();new.attribue_par:=auth.uid();
 end if;
 return new;
end;$$;
revoke all on function public.versionner_affectation() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger versionner_responsable before update on public.affectations_dossiers for each row execute function public.versionner_affectation();

create function public.affecter_dossier(le_dossier uuid,le_membre uuid,revision_attendue uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();courante public.affectations_dossiers;resultat uuid;
begin
 if agence is null then return null;end if;
 -- Ce verrou precede celui du dossier pour serialiser avec une exclusion.
 if le_membre is not null then
  perform 1 from public.membres_agence m join public.agences a on a.id=m.agence_id join auth.users u on u.id=m.utilisateur_id
  where m.agence_id=agence and m.utilisateur_id=le_membre and u.email_confirmed_at is not null
  and lower(split_part(u.email,'@',2))=a.domaine for key share of m;
  if not found then return null;end if;
 end if;
 perform 1 from public.dossiers where id=le_dossier and agence_id=agence
 and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis') for update;
 if not found then return null;end if;
 select * into courante from public.affectations_dossiers where dossier_id=le_dossier for update;
 if courante.revision is distinct from revision_attendue then return null;end if;
 if not public.est_admin_agence() and not coalesce(
  (le_membre=auth.uid() and (courante.membre_id is null or courante.membre_id=auth.uid()))
  or (le_membre is null and courante.membre_id=auth.uid()),false) then return null;end if;
 if not exists(select 1 from public.dossiers where id=le_dossier and agence_id=public.agence_courante() and expire_le>clock_timestamp()) then return null;end if;
 if courante.dossier_id is not null and courante.membre_id is not distinct from le_membre then return courante.revision;end if;
 insert into public.affectations_dossiers(dossier_id,membre_id,revision,attribue_par)
 select d.id,le_membre,gen_random_uuid(),auth.uid() from public.dossiers d where d.id=le_dossier and d.expire_le>clock_timestamp()
 on conflict(dossier_id) do update set membre_id=excluded.membre_id,revision=excluded.revision,attribue_par=excluded.attribue_par,modifie_le=clock_timestamp()
 returning revision into resultat;
 return resultat;
end;$$;

create function public.responsables_des_dossiers(les_dossiers uuid[])
returns table(dossier_id uuid,revision uuid,responsable_id uuid,responsable_email text,modifie_le timestamptz)
language sql stable security definer set search_path='' as $$
 select d.id,f.revision,f.membre_id,u.email::text,f.modifie_le
 from public.dossiers d join public.agences a on a.id=d.agence_id
 left join public.affectations_dossiers f on f.dossier_id=d.id
 left join public.membres_agence m on m.utilisateur_id=f.membre_id and m.agence_id=d.agence_id
 left join auth.users u on u.id=m.utilisateur_id and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine
 where cardinality(les_dossiers) between 1 and 50 and d.id=any(les_dossiers)
 and d.agence_id=public.agence_courante() and d.expire_le>clock_timestamp() and d.statut<>'expire'
 order by d.id;
$$;
revoke all on function public.affecter_dossier(uuid,uuid,uuid),public.responsables_des_dossiers(uuid[])
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.affecter_dossier(uuid,uuid,uuid),public.responsables_des_dossiers(uuid[]) to authenticated;

create function public.liberer_dossiers_du_membre() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.affectations_dossiers f set membre_id=null,revision=gen_random_uuid(),attribue_par=auth.uid(),modifie_le=clock_timestamp()
 where f.membre_id=old.utilisateur_id and exists(select 1 from public.dossiers d where d.id=f.dossier_id and d.agence_id=old.agence_id);
 return old;
end;$$;
revoke all on function public.liberer_dossiers_du_membre() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger liberer_dossiers_apres_exclusion after delete on public.membres_agence for each row execute function public.liberer_dossiers_du_membre();

notify pgrst,'reload schema';
