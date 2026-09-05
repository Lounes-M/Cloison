create table public.notifications_statut (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  statut text not null,
  cree_le timestamptz not null default now()
);
alter table public.notifications_statut enable row level security;
revoke all on public.notifications_statut from public, anon, authenticated, porteur_lien, serveur;
create function public.programmer_notification_statut()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.statut is distinct from old.statut and not new.demonstration then
    insert into public.notifications_statut(dossier_id,statut) values (new.id,new.statut);
  end if;
  return new;
end;
$$;
create trigger notification_statut after update of statut on public.dossiers
for each row execute function public.programmer_notification_statut();
revoke all on function public.programmer_notification_statut() from public;

create function public.notifications_a_livrer(le_dossier uuid default null)
returns table(id uuid,dossier jsonb,contacts text[])
language sql security definer set search_path='' as $$
  with perimees as (
    delete from public.notifications_statut n using public.dossiers d
    where n.dossier_id=d.id and d.expire_le <= now() returning n.id
  )
  select n.id,
    jsonb_build_object('id',d.id,'reference',d.reference,'statut',
      case when d.statut=n.statut then n.statut else 'obsolete' end,
      'email_locataire',d.email_locataire,'email_garant',d.email_garant,
      'demonstration',d.demonstration),
    array(select u.email from public.membres_agence m
      join auth.users u on u.id=m.utilisateur_id
      join public.agences a on a.id=m.agence_id
      where a.id=d.agence_id and a.statut='verifiee'
      and u.email_confirmed_at is not null
      and split_part(lower(u.email),'@',2)=lower(a.domaine))
  from public.notifications_statut n join public.dossiers d on d.id=n.dossier_id
  where d.expire_le > now() and (le_dossier is null or n.dossier_id=le_dossier)
  order by n.cree_le,n.id limit 20;
$$;
create function public.acquitter_notification(identifiant uuid)
returns void language sql security definer set search_path='' as $$
  delete from public.notifications_statut where id=identifiant;
$$;
revoke all on function public.notifications_a_livrer(uuid),public.acquitter_notification(uuid)
  from public,anon,authenticated,porteur_lien;
grant execute on function public.notifications_a_livrer(uuid),public.acquitter_notification(uuid) to serveur;
