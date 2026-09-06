-- Un retrait ou un abandon ne depend plus d'un DELETE Storage immediat.
-- Le marqueur survit a l'acquittement de la file, jusqu'a la fin du dossier.
create table public.chemins_abandonnes (
  chemin text primary key,
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  cree_le timestamptz not null default now(),
  check (chemin like dossier_id::text || '/%')
);
create index chemins_abandonnes_dossier on public.chemins_abandonnes(dossier_id);
alter table public.chemins_abandonnes enable row level security;
revoke all on public.chemins_abandonnes from public,anon,authenticated,porteur_lien,depot_piece,serveur;

create function public.refuser_chemin_abandonne()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- Meme verrou que la programmation : une inscription tardive ne peut pas
  -- passer entre la verification d'absence et l'ajout a la file.
  perform 1 from public.dossiers where id=new.dossier_id for update;
  if exists(select 1 from public.chemins_abandonnes where chemin=new.chemin)
    or exists(select 1 from public.objets_a_supprimer where chemin=new.chemin) then
    raise exception 'Ce chemin a ete abandonne.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger a_piece_chemin_vivant before insert on public.pieces
for each row execute function public.refuser_chemin_abandonne();

create function public.programmer_piece_retiree()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- Une cascade peut avoir deja efface le dossier. La file, sans FK, reste.
  perform 1 from public.dossiers where id=old.dossier_id for update;
  if found then
    insert into public.chemins_abandonnes(chemin,dossier_id)
    values(old.chemin,old.dossier_id) on conflict do nothing;
  end if;
  insert into public.objets_a_supprimer(chemin) values(old.chemin) on conflict do nothing;
  return old;
end $$;
create trigger piece_retiree_en_file after delete on public.pieces
for each row execute function public.programmer_piece_retiree();

create function public.programmer_suppression_objet(le_chemin text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare dossier uuid;
begin
  dossier := public.dossier_courant();
  if dossier is null or public.partie_courante() <> 'garant'
    or le_chemin is null or le_chemin not like dossier::text || '/%'
    or length(le_chemin) > 200 then
    raise exception 'Suppression refusee.' using errcode='42501';
  end if;
  perform 1 from public.dossiers where id=dossier for update;
  if not found then raise exception 'Suppression refusee.' using errcode='42501'; end if;
  -- Une reponse HTTP perdue ne prouve pas que l'inscription a echoue.
  if exists(select 1 from public.pieces where chemin=le_chemin) then return; end if;
  -- Le RPC public ne doit pas creer une file de chemins inventes. Le trigger
  -- DELETE a deja programme un retrait meme si Storage est momentanement vide.
  if not exists(select 1 from storage.objects where bucket_id='pieces' and name=le_chemin) then return; end if;
  insert into public.chemins_abandonnes(chemin,dossier_id)
  values(le_chemin,dossier) on conflict do nothing;
  insert into public.objets_a_supprimer(chemin) values(le_chemin) on conflict do nothing;
end $$;

revoke all on function public.refuser_chemin_abandonne(),public.programmer_piece_retiree(),public.programmer_suppression_objet(text)
from public,anon,authenticated,porteur_lien,depot_piece,serveur;
grant execute on function public.programmer_suppression_objet(text) to porteur_lien,depot_piece;

-- La maintenance sous serveur est le seul chemin de suppression physique.
revoke delete on storage.objects from porteur_lien,depot_piece;
