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
