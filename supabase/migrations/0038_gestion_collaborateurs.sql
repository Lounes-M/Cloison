-- Administration de sa seule agence, avec traces en ecriture interne.
create table public.journal_administration_agence (
 id bigint generated always as identity primary key,
 agence_id uuid not null references public.agences(id) on delete cascade,
 acteur_id uuid,
 cible_id uuid not null,
 action text not null check(action in ('role','exclusion','readmission')),
 ancien_role text,
 nouveau_role text,
 quand timestamptz not null default now()
);
create index journal_administration_agence_date on public.journal_administration_agence(agence_id,quand desc,id desc);
alter table public.journal_administration_agence enable row level security;
revoke all on public.journal_administration_agence from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant select on public.journal_administration_agence to authenticated;
create policy administration_lit_journal on public.journal_administration_agence for select to authenticated
 using(agence_id=public.agence_courante() and public.est_admin_agence());

create function public.journaliser_administration()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.agences where id=old.agence_id) then
   insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action,ancien_role)
    values(old.agence_id,auth.uid(),old.utilisateur_id,'exclusion',old.role);
  end if;
  return old;
 end if;
 if new.role is distinct from old.role then
  insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action,ancien_role,nouveau_role)
   values(old.agence_id,auth.uid(),old.utilisateur_id,'role',old.role,new.role);
 end if;
 return new;
end;
$$;
create trigger journal_administration after update of role or delete on public.membres_agence
for each row execute function public.journaliser_administration();
revoke all on function public.journaliser_administration() from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create function public.collaborateurs_agence(decalage integer default 0)
returns table(utilisateur_id uuid,email text,etat text,admissible boolean)
language plpgsql stable security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then
  raise exception 'Administration refusee' using errcode='42501';
 end if;
 if decalage is null or decalage<0 or decalage>499900 then raise exception 'Page invalide' using errcode='check_violation'; end if;
 return query
 with equipe as (
  select m.utilisateur_id,m.role as etat from public.membres_agence m where m.agence_id=agence
  union all
  select e.utilisateur_id,'exclu'::text from public.exclusions_agence e where e.agence_id=agence
 )
 select e.utilisateur_id,
  case when lower(split_part(u.email,'@',2))=a.domaine then u.email::text else null end,
  e.etat,
  u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine
 from equipe e join auth.users u on u.id=e.utilisateur_id join public.agences a on a.id=agence
 order by e.utilisateur_id limit 51 offset decalage;
end;
$$;
create function public.readmettre_collaborateur(cible uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then
  raise exception 'Administration refusee' using errcode='42501';
 end if;
 delete from public.exclusions_agence e using auth.users u,public.agences a
 where e.agence_id=agence and e.utilisateur_id=cible and u.id=cible and a.id=agence
  and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine;
 if not found then return false; end if;
 insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action)
  values(agence,auth.uid(),cible,'readmission');
 return true;
end;
$$;
revoke all on function public.collaborateurs_agence(integer),public.readmettre_collaborateur(uuid)
 from public,anon,porteur_lien,serveur,depot_piece;
grant execute on function public.collaborateurs_agence(integer),public.readmettre_collaborateur(uuid) to authenticated;

create function public.journal_de_mon_agence()
returns table(id bigint,action text,acteur text,cible text,quand timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then raise exception 'Administration refusee' using errcode='42501'; end if;
 return query select j.id,j.action,
  case when lower(split_part(u.email,'@',2))=a.domaine then u.email::text end,
  case when lower(split_part(v.email,'@',2))=a.domaine then v.email::text end,j.quand
 from public.journal_administration_agence j join public.agences a on a.id=j.agence_id
 left join auth.users u on u.id=j.acteur_id left join auth.users v on v.id=j.cible_id
 where j.agence_id=agence order by j.quand desc,j.id desc limit 50;
end;
$$;
revoke all on function public.journal_de_mon_agence() from public,anon,porteur_lien,serveur,depot_piece;
grant execute on function public.journal_de_mon_agence() to authenticated;

create index journal_administration_retention on public.journal_administration_agence(quand);
create or replace function public.purger_les_dossiers_expires()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d record; nombre integer := 0;
begin
  delete from public.journal_administration_agence where id in (
    select id from public.journal_administration_agence where quand < now()-interval '90 days' order by quand limit 5000
  );
  for d in select id,statut from public.dossiers
    where expire_le < now() and coffre_purge_le is null for update skip locked loop
    insert into public.objets_a_supprimer(chemin)
      select name from storage.objects where bucket_id='pieces' and name like d.id::text||'/%'
      union select chemin from public.pieces where dossier_id=d.id
      on conflict do nothing;
    -- Plus aucune cle vivante, meme si Storage est momentanement indisponible.
    delete from public.jetons_actifs where dossier_id=d.id;
    delete from public.cles_dossier where dossier_id=d.id;
    delete from public.engagements where dossier_id=d.id;
    delete from public.pieces where dossier_id=d.id;
    delete from public.journal_acces where dossier_id=d.id;
    if d.statut='signe' then
      update public.dossiers set coffre_purge_le=now() where id=d.id;
    else
      delete from public.dossiers where id=d.id;
    end if;
    nombre := nombre + 1;
  end loop;
  return nombre;
end $$;
grant execute on function public.purger_les_dossiers_expires() to serveur;
comment on function public.purger_les_dossiers_expires() is
  'Detruit les cles et met les octets expires en file. Le travailleur doit ensuite appeler Storage.remove et acquitter chaque chemin.';


revoke all on sequence public.journal_administration_agence_id_seq from public,anon,authenticated,porteur_lien,serveur,depot_piece;
