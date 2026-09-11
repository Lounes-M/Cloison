-- Preferences personnelles, supprimees avec l'appartenance a l'agence.
create table public.preferences_notifications (
 utilisateur_id uuid primary key references public.membres_agence(utilisateur_id) on delete cascade,
 mode text not null check(mode in ('tous','mes','aucun')),
 revision uuid not null default gen_random_uuid()
);
alter table public.preferences_notifications enable row level security;
revoke all on public.preferences_notifications from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant select on public.preferences_notifications to authenticated;
create policy "Membre lit ses preferences" on public.preferences_notifications for select to authenticated using (
 utilisateur_id=auth.uid() and public.agence_courante() is not null
);
create function public.mes_preferences_notifications()
returns table(mode text,revision uuid) language sql stable security definer set search_path='' as $$
 select coalesce(p.mode,'tous'),p.revision from public.membres_agence m
 left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
 where m.utilisateur_id=auth.uid() and m.agence_id=public.agence_courante();
$$;
create function public.regler_notifications(le_mode text,revision_attendue uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare courante uuid;resultat uuid;
begin
 if le_mode is null or le_mode not in ('tous','mes','aucun') then return null;end if;
 perform 1 from public.membres_agence where utilisateur_id=auth.uid() and agence_id=public.agence_courante() for update;
 if not found then return null;end if;
 select revision into courante from public.preferences_notifications where utilisateur_id=auth.uid();
 if courante is distinct from revision_attendue then return null;end if;
 insert into public.preferences_notifications(utilisateur_id,mode) values(auth.uid(),le_mode)
 on conflict(utilisateur_id) do update set mode=excluded.mode,revision=gen_random_uuid()
 returning revision into resultat;
 return resultat;
end;$$;
revoke all on function public.mes_preferences_notifications(),public.regler_notifications(text,uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.mes_preferences_notifications(),public.regler_notifications(text,uuid) to authenticated;

-- Seuls les destinataires agence du suivi sont filtres. Les porteurs et les
-- messages Auth, securite, activation ou paiement ne passent pas par ce choix.
create or replace function public.notifications_a_livrer(le_dossier uuid default null)
returns table(id uuid,dossier jsonb,contacts text[])
language sql security definer set search_path='' as $$
  with perimees as (
    delete from public.notifications_statut n using public.dossiers d
    where n.dossier_id=d.id and d.expire_le <= now() returning n.id
  )
  select n.id,
    jsonb_build_object('id',d.id,'reference',d.reference,'statut',
      case
       when n.complement_id is not null then case when exists(
        select 1 from public.complements_documentaires c where c.id=n.complement_id and c.dossier_id=d.id and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
        and ((n.statut='complement_demande' and c.etat='demande' and n.cree_le>=c.attendu_depuis)
         or (n.statut='complement_fourni' and c.etat='fourni' and n.cree_le>=c.fourni_le))
       ) then n.statut else 'obsolete' end
       when d.statut=n.statut then n.statut else 'obsolete' end,
      'email_locataire',d.email_locataire,'email_garant',d.email_garant,
      'demonstration',d.demonstration),
    array(select u.email from public.membres_agence m
      join auth.users u on u.id=m.utilisateur_id
      join public.agences a on a.id=m.agence_id
      left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
      where a.id=d.agence_id and a.statut='verifiee'
      and u.email_confirmed_at is not null
      and split_part(lower(u.email),'@',2)=lower(a.domaine)
      and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(
        select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id))))
  from public.notifications_statut n join public.dossiers d on d.id=n.dossier_id
  where d.expire_le > now() and (le_dossier is null or n.dossier_id=le_dossier)
  order by n.cree_le,n.id limit 20;
$$;
