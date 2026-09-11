begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"91f20209f4e166838e30fbd1e313421cc545fbabe1afcceed62542619f66bcde","indexes":"01c38c0fc4e69dcf2944165a5e685f0e1237acf8482e34c4eb1e0d11aafc9a9e","colonnes":"46b74be5ce1f22c2e4bcde7d1f6ae38a7c69ea11549eced1759a9b8b9d9c8b5d","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ff4ec05779a604c711111142274b4a57fc9d7c4f0015b1a4c3e234ea48ebdba5","politiques":"1f38b4ca6da04266155d174b49b9a182041a92ab5fc1eb597a6101b290307724","contraintes":"1053093ac53da4e96d847efc2ef22fd747944b8beb0ff221ea5ae38d62535f89","declencheurs":"7962e56c190680ea80923b0b426cb5ecfa2008e88fcb9d848d63a5224dfe2889"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"ac66f0d270f636adc0e34db1a3c473a5d3f1143011190f7cefeb89ac6819cb6d","indexes":"f14d5873a8c252c82c8aae617c9e11571dc70eccc95d2c5ff3d71618d7be543f","colonnes":"6fb07f10fd8421a3efbf9af268540bba43cb89c8dd729a089c1697ceeca7262b","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"c1f5cf649cfa3fc7bb70e6fcb28a52f55a2e44fd349f159f5d22eafb3e6a147f","politiques":"d3df550bb38e995b62099e6c7b52b0ca5c7c2c098fa3a3128a75e89a7ae407cb","contraintes":"e84652bf1b82527474e3bf293f85732bd0c098ba3cd89869dd7e2ac959cd9a09","declencheurs":"7962e56c190680ea80923b0b426cb5ecfa2008e88fcb9d848d63a5224dfe2889"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
