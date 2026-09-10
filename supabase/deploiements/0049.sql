begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"b8880de1805c421d3dc85aa1aba92cf8927291b6780e27c2bb4d421716a5659e","indexes":"1feddd32b1badafb9ae9293587bdc0b89f8eaa08dcf33a96a8784b399630ce5b","colonnes":"860791de7bac52d319436310b57f8b567a223f9186162ec19e1f83d774b55dfa","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"d13d0649d8d0d728c1643697dbc2fe682f860b634e326bc4477bdc52fd8f5004","politiques":"5c46deeaaeb33e8128c9d82fe37137008626596013776101fe1ee9772cf45dd3","contraintes":"841a94cf1cd77f0f6824083d2cb430853e14be104557dfa3697e35bc6778dc8d","declencheurs":"9ede6a6dd675e8185855e2136283a161e76e88995bcbf1c0d83f29aafaa88350"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
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
 and expire_le>clock_timestamp() and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis') for update;
 if not found then return null;end if;
 perform 1 from public.pieces p where p.id=la_piece and p.dossier_id=le_dossier
 and not exists(select 1 from public.complements_documentaires c where c.dossier_id=le_dossier and p.id=any(c.pieces_ecartees)) for update;
 if not found then return null;end if;
 select revision into derniere from public.examens_documentaires where piece_id=la_piece order by id desc limit 1;
 if derniere is distinct from revision_attendue then return null;end if;
 if (select count(*) from public.examens_documentaires where piece_id=la_piece and cree_le>clock_timestamp()-interval '1 day')>=20 then return null;end if;
 insert into public.examens_documentaires(dossier_id,piece_id,etat,acteur_id)
 values(le_dossier,la_piece,le_statut,auth.uid()) returning revision into resultat;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"390080db311f105bc601740e73eb48a76a5f19f537cf1430770725569f699973","indexes":"5b0b7bf3c1f0758593b255fe3df680c027d1710c2f249be081b4279b9abf3622","colonnes":"04d88966b46d9e90dab30be76920a1b87edfd4baa33cf35dbd4696a1cb3f6964","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"c2fa909ab078725739768cfb5b50a68c64eb2e8d09f847725acc1b3f657974c1","politiques":"b5642a4bd27302251a14fc7174b557ca7f416d7f49b96cc470567bbf85b08b99","contraintes":"397253087a16439265214f3cbfbafe0fe20fd463edc27b73338ef11907e28639","declencheurs":"9ede6a6dd675e8185855e2136283a161e76e88995bcbf1c0d83f29aafaa88350"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
