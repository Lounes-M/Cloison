-- Coupure immediate des anciens JWT apres une connexion par code de recuperation.
create table public.sessions_recuperation (
 utilisateur_id uuid primary key references auth.users(id) on delete cascade,
 session_preservee uuid not null,
 coupe_le timestamptz not null default clock_timestamp()
);
alter table public.sessions_recuperation enable row level security;
revoke all on public.sessions_recuperation from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

create function public.session_recuperee_valide() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.sessions_recuperation;courante uuid;
begin
 select * into r from public.sessions_recuperation where utilisateur_id=auth.uid();
 if not found then return true;end if;
 courante:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
 return exists(select 1 from auth.sessions s where s.id=courante and s.user_id=r.utilisateur_id
  and s.aal::text='aal2' and (s.id=r.session_preservee or s.created_at>=r.coupe_le));
exception when invalid_text_representation then return false;
end;$$;
revoke all on function public.session_recuperee_valide() from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

create function public.revoquer_sessions_apres_recuperation() returns boolean
language plpgsql security definer set search_path='' as $$
declare c jsonb;courante uuid;utilisateur uuid:=auth.uid();
begin
 c:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 if c->>'aal' is distinct from 'aal2' or not coalesce(jsonb_path_exists(c,'$.amr[*] ? (@.method == "mfa/recovery_code")'),false) then return false;end if;
 courante:=(c->>'session_id')::uuid;
 if not exists(select 1 from auth.sessions s where s.id=courante and s.user_id=utilisateur and s.aal::text='aal2') then return false;end if;
 if not public.session_recuperee_valide() then return false;end if;
 insert into public.sessions_recuperation(utilisateur_id,session_preservee) values(utilisateur,courante)
 on conflict(utilisateur_id) do update set session_preservee=excluded.session_preservee,coupe_le=clock_timestamp();
 return true;
exception when invalid_text_representation then return false;
end;$$;
revoke all on function public.revoquer_sessions_apres_recuperation() from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.revoquer_sessions_apres_recuperation() to authenticated;

create or replace function public.agence_courante()
returns uuid language sql stable security definer set search_path='' as $$
 select m.agence_id from public.membres_agence m
 join public.agences a on a.id=m.agence_id join auth.users u on u.id=m.utilisateur_id
 where m.utilisateur_id=auth.uid() and a.statut<>'suspendue'
 and nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'='aal2'
 and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine
 and public.session_recuperee_valide()
$$;
