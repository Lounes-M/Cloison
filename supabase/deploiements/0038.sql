begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"4fdd5bd46de2bcb67ccb59ea0a595868cb7732d7df0063f70b9d7381ac0cd411","indexes":"8d6762b21d3b47a8d4ed5019cd3d013e122b317bea9802c7d64a2a9907af514e","colonnes":"c9045994a4b0ccfe2ca6414194fed77c39a829ba410c9ca08ac633fee669cf92","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"e18b2172511360c03b9236bc4e3e6b207b1793a735a952a2308e4a9cd24efd9f","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"c854f46ff873978fad614a9db743ad342a35aacce0480ee485d624a3daa37646","declencheurs":"0f47a5809055b8c35d3434296089b5c9b0572327bc7cc03a885ba13024eb07dd"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"5e967208d1544790baee0a6493a3f6f745897133fb6cf6fc21e1895e7a7dbb36","indexes":"69bc310736c80aad8996dc5ccb2cdf7f573ccf3c9067a6729139a71498ba6584","colonnes":"d22d5395ef60d55342ffe9070199c76a19bbcfabc3c837d7ed5548a5df87dd42","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"f494b3f117112abbb2262f17f25b172295610c4fe4e6faf43e7986e8b9cf9867","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"c34c12d0c1658c6923d6ae2c5f80da93ae189a8518fecdea5dfff4c80e17046f","declencheurs":"d82b391c3ca00c8c80d7e8442b7306e41d774d21ab8e009fe4758850ae5be4be"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
