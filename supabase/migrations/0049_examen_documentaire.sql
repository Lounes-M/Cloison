-- Appreciation humaine de la piece courante, sans extraction ni decision automatique.
create table public.examens_documentaires (
 id bigint generated always as identity primary key,
 revision uuid not null unique default gen_random_uuid(),
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 piece_id uuid not null references public.pieces(id) on delete cascade,
 etat text not null check(etat in ('examine','a_revoir','a_examiner')),
 acteur_id uuid references auth.users(id) on delete set null,
 cree_le timestamptz not null default clock_timestamp()
);
create index examens_piece_recents on public.examens_documentaires(piece_id,id desc);
alter table public.examens_documentaires enable row level security;
revoke all on public.examens_documentaires from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
revoke all on sequence public.examens_documentaires_id_seq from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant select on public.examens_documentaires to authenticated;
create policy "Agence lit ses examens" on public.examens_documentaires for select to authenticated using (
 exists(select 1 from public.dossiers d where d.id=dossier_id and d.agence_id=public.agence_courante()
 and d.expire_le>clock_timestamp() and d.statut<>'expire')
);

create function public.enregistrer_examen_documentaire(le_dossier uuid,la_piece uuid,le_statut text,revision_attendue uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare derniere uuid; resultat uuid;
begin
 if le_statut is null or le_statut not in ('examine','a_revoir','a_examiner') then return null;end if;
 perform 1 from public.dossiers where id=le_dossier and agence_id=public.agence_courante()
 and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis') for update;
 if not found then return null;end if;
 perform 1 from public.pieces p where p.id=la_piece and p.dossier_id=le_dossier
 and not exists(select 1 from public.complements_documentaires c where c.dossier_id=le_dossier and p.id=any(c.pieces_ecartees)) for update;
 if not found then return null;end if;
 select revision into derniere from public.examens_documentaires where piece_id=la_piece order by id desc limit 1;
 if derniere is distinct from revision_attendue then return null;end if;
 if (select count(*) from public.examens_documentaires where piece_id=la_piece and cree_le>clock_timestamp()-interval '1 day')>=20 then return null;end if;
 insert into public.examens_documentaires(dossier_id,piece_id,etat,acteur_id)
 select le_dossier,la_piece,le_statut,auth.uid() from public.dossiers d
 where d.id=le_dossier and d.expire_le>clock_timestamp() returning revision into resultat;
 return resultat;
end;$$;

create function public.examens_du_dossier(le_dossier uuid)
returns table(piece_id uuid,revision uuid,etat text,cree_le timestamptz,acteur text)
language sql stable security definer set search_path='' as $$
 select distinct on (e.piece_id) e.piece_id,e.revision,e.etat,e.cree_le,u.email::text
 from public.examens_documentaires e join public.dossiers d on d.id=e.dossier_id
 join public.pieces p on p.id=e.piece_id and p.dossier_id=d.id
 left join public.membres_agence m on m.utilisateur_id=e.acteur_id and m.agence_id=d.agence_id
 left join auth.users u on u.id=m.utilisateur_id
 where d.id=le_dossier and d.agence_id=public.agence_courante()
 and d.expire_le>clock_timestamp() and d.statut<>'expire'
 and not exists(select 1 from public.complements_documentaires c where c.dossier_id=d.id and p.id=any(c.pieces_ecartees))
 order by e.piece_id,e.id desc;
$$;
revoke all on function public.enregistrer_examen_documentaire(uuid,uuid,text,uuid),public.examens_du_dossier(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.enregistrer_examen_documentaire(uuid,uuid,text,uuid),public.examens_du_dossier(uuid) to authenticated;
