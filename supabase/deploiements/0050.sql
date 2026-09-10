begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"390080db311f105bc601740e73eb48a76a5f19f537cf1430770725569f699973","indexes":"5b0b7bf3c1f0758593b255fe3df680c027d1710c2f249be081b4279b9abf3622","colonnes":"04d88966b46d9e90dab30be76920a1b87edfd4baa33cf35dbd4696a1cb3f6964","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ccf38f13a07965e85baa03638de24f0bcf5e387513ee174ee4f0cca2cdca27f8","politiques":"b5642a4bd27302251a14fc7174b557ca7f416d7f49b96cc470567bbf85b08b99","contraintes":"397253087a16439265214f3cbfbafe0fe20fd463edc27b73338ef11907e28639","declencheurs":"9ede6a6dd675e8185855e2136283a161e76e88995bcbf1c0d83f29aafaa88350"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"91f20209f4e166838e30fbd1e313421cc545fbabe1afcceed62542619f66bcde","indexes":"01c38c0fc4e69dcf2944165a5e685f0e1237acf8482e34c4eb1e0d11aafc9a9e","colonnes":"46b74be5ce1f22c2e4bcde7d1f6ae38a7c69ea11549eced1759a9b8b9d9c8b5d","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ff4ec05779a604c711111142274b4a57fc9d7c4f0015b1a4c3e234ea48ebdba5","politiques":"1f38b4ca6da04266155d174b49b9a182041a92ab5fc1eb597a6101b290307724","contraintes":"1053093ac53da4e96d847efc2ef22fd747944b8beb0ff221ea5ae38d62535f89","declencheurs":"7962e56c190680ea80923b0b426cb5ecfa2008e88fcb9d848d63a5224dfe2889"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
