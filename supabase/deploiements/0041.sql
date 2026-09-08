begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"a6909876c3c084e1c04515875a42f2be622691ed617a8a63a0db2f60eae00da7","indexes":"138084aeacc976f89b0c46b205f54dcc429e11ee1c7458de9f71578fe5f0ad48","colonnes":"afbfaf48af4b9e104224b1bf4a6a30737519675434e8d34efd3ced5b1d59c13c","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"2adf28580906dc476ed11199dd1b33606d1dda2af6ffdb0720ce01d6b0c7a0e2","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"b5efe5c108e595e0fdf75a47267dfe62d1fd9d1b0e24f21e9c51fc8b17f4512f","declencheurs":"d82b391c3ca00c8c80d7e8442b7306e41d774d21ab8e009fe4758850ae5be4be"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
-- Ordre total et curseur de position : aucun droit n'est porte par le curseur.
create index journal_acces_dossier_curseur on public.journal_acces(dossier_id,quand desc,id desc);
create function public.journal_du_dossier(le_dossier uuid,avant_quand timestamptz default null,avant_id uuid default null)
returns table(id uuid,action text,acteur text,identite text,quand timestamptz,piece_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
 if (avant_quand is null)<>(avant_id is null) then raise exception 'Curseur incomplet'; end if;
 return query
 select j.id,j.action,j.acteur,
  case when j.acteur='agence' and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine then u.email::text else null end,
  j.quand,j.piece_id
 from public.journal_acces j join public.dossiers d on d.id=j.dossier_id
 left join public.membres_agence m on m.utilisateur_id=j.acteur_id and m.agence_id=d.agence_id
 left join public.agences a on a.id=m.agence_id
 left join auth.users u on u.id=m.utilisateur_id
 where d.id=le_dossier and d.expire_le>now()
 and ((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='porteur_lien' and public.partie_courante()='garant' and d.id=public.dossier_courant())
 or (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='authenticated' and d.agence_id=public.agence_courante()))
 and (avant_quand is null or (j.quand,j.id)<(avant_quand,avant_id))
 order by j.quand desc,j.id desc limit 51;
end $$;
revoke all on function public.journal_du_dossier(uuid,timestamptz,uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.journal_du_dossier(uuid,timestamptz,uuid) to authenticated,porteur_lien;

-- Compatibilite pendant le deploiement : meme protection sur l'ancien RPC.
create or replace function public.mon_journal_acces()
returns table(id uuid,action text,acteur text,identite text,quand timestamptz)
language sql stable security definer set search_path='' as $$
 select j.id,j.action,j.acteur,
  case when j.acteur='agence' and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine then u.email::text else null end,j.quand
 from public.journal_acces j join public.dossiers d on d.id=j.dossier_id
 left join public.membres_agence m on m.utilisateur_id=j.acteur_id and m.agence_id=d.agence_id
 left join public.agences a on a.id=m.agence_id
 left join auth.users u on u.id=m.utilisateur_id
 where nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='porteur_lien'
 and public.partie_courante()='garant' and d.id=public.dossier_courant() and d.expire_le>now()
 order by j.quand desc,j.id desc limit 100;
$$;
revoke all on function public.mon_journal_acces() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.mon_journal_acces() to porteur_lien;

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"a6909876c3c084e1c04515875a42f2be622691ed617a8a63a0db2f60eae00da7","indexes":"f3e87e3286f328a3dbbdee69bbf51d3c626d99bcdf1de2ac79f215646532a47a","colonnes":"afbfaf48af4b9e104224b1bf4a6a30737519675434e8d34efd3ced5b1d59c13c","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ec264c49daa654fe84ea58d17e2de37b6db5c2699ac4990cca1dd1d73bc284c4","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"b5efe5c108e595e0fdf75a47267dfe62d1fd9d1b0e24f21e9c51fc8b17f4512f","declencheurs":"d82b391c3ca00c8c80d7e8442b7306e41d774d21ab8e009fe4758850ae5be4be"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
