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
