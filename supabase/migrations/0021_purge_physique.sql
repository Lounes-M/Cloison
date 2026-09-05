-- Les justificatifs et les cles ne partagent pas la retention des actes.
-- La file survit au dossier : ses chemins servent uniquement au nettoyage.
create table public.objets_a_supprimer (
  chemin text primary key,
  cree_le timestamptz not null default now()
);
alter table public.objets_a_supprimer enable row level security;
revoke all on public.objets_a_supprimer from public, anon, authenticated, porteur_lien, serveur;
grant select, delete on public.objets_a_supprimer to serveur;
create policy "Le serveur traite la file de suppression" on public.objets_a_supprimer
for all to serveur using (true) with check (false);
grant usage on schema storage to serveur;
grant select, delete on storage.objects to serveur;
create policy "Le serveur supprime seulement les objets en file" on storage.objects
for delete to serveur using (bucket_id='pieces' and name in(select chemin from public.objets_a_supprimer));
create policy "Le serveur retrouve les objets en file" on storage.objects
for select to serveur using (bucket_id='pieces' and name in(select chemin from public.objets_a_supprimer));

alter table public.dossiers add column coffre_purge_le timestamptz;
alter table public.factures_actes alter column dossier_id drop not null;
alter table public.factures_actes drop constraint factures_actes_dossier_id_fkey;
alter table public.factures_actes add foreign key(dossier_id) references public.dossiers(id) on delete set null;

create or replace function public.purger_les_dossiers_expires()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d record; nombre integer := 0;
begin
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
