-- Les logements de l'agence, pour comparer les candidats d'un meme bien.
--
-- Une agence recoit plusieurs dossiers pour un appartement et doit choisir.
-- Jusqu'ici, rien ne reliait ces dossiers entre eux. Un logement est un
-- libelle choisi par l'agence et un loyer de reference ; un dossier peut y
-- etre rattache, et s'ouvrir avec son loyer.
--
-- Le logement ne decrit que le bien : aucune donnee de candidat. Il survit
-- donc a la purge des dossiers, qui le detachent en partant. Le locataire et
-- le garant ne le voient pas.

create table public.logements (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  libelle text not null check (length(btrim(libelle)) between 1 and 120),
  loyer_cents bigint null check (loyer_cents > 0 and loyer_cents <= 10000000),
  archive boolean not null default false,
  cree_le timestamptz not null default now()
);
create index logements_agence_idx on public.logements(agence_id, archive, cree_le desc);
alter table public.logements enable row level security;

comment on table public.logements is
  'Biens proposes par une agence. Libelle et loyer de reference, aucune donnee de candidat.';

revoke all on public.logements
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant select, delete on public.logements to authenticated;
grant insert (agence_id, libelle, loyer_cents) on public.logements to authenticated;
grant update (libelle, loyer_cents, archive) on public.logements to authenticated;

create policy "Une agence lit ses logements"
  on public.logements for select to authenticated
  using (agence_id = public.agence_courante());
create policy "Une agence cree ses logements"
  on public.logements for insert to authenticated
  with check (agence_id = public.agence_courante());
create policy "Une agence modifie ses logements"
  on public.logements for update to authenticated
  using (agence_id = public.agence_courante())
  with check (agence_id = public.agence_courante());
create policy "Une agence supprime ses logements"
  on public.logements for delete to authenticated
  using (agence_id = public.agence_courante());

alter table public.dossiers
  add column logement_id uuid null references public.logements(id) on delete set null;
create index dossiers_logement_idx on public.dossiers(logement_id) where logement_id is not null;
comment on column public.dossiers.logement_id is
  'Logement de l''agence pour lequel ce dossier est presente. Jamais sur le dossier d''un second garant.';

grant update (logement_id) on public.dossiers to authenticated;

-- Un dossier ne se rattache qu'a un logement de sa propre agence, et le
-- second garant suit le principal sans rattachement propre.
create function public.verifier_logement_du_dossier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.logement_id is null then
    return new;
  end if;
  if new.dossier_principal is not null then
    raise exception 'Le logement se rattache au dossier principal.' using errcode='42501';
  end if;
  if not exists(select 1 from public.logements l
                 where l.id = new.logement_id and l.agence_id = new.agence_id) then
    raise exception 'Logement inconnu pour cette agence.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.verifier_logement_du_dossier()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger logement_du_dossier before insert or update of logement_id, agence_id
on public.dossiers for each row execute function public.verifier_logement_du_dossier();

-- Le tableau d'un logement : combien de candidats, ou ils en sont. Une seule
-- requete pour la liste, sans lire les dossiers un a un.
create function public.logements_de_mon_agence(avec_archives boolean default false)
returns table(id uuid, libelle text, loyer_cents bigint, archive boolean, cree_le timestamptz,
  candidats integer, complets integer, pris integer)
language sql stable security definer set search_path='' as $$
  select l.id, l.libelle, l.loyer_cents, l.archive, l.cree_le,
    count(d.id)::int,
    count(d.id) filter (where d.statut = 'complet')::int,
    count(d.id) filter (where d.statut in ('transmis', 'signe'))::int
    from public.logements l
    left join public.dossiers d on d.logement_id = l.id and d.expire_le > now()
     and not d.demonstration
   where l.agence_id = public.agence_courante() and (avec_archives or not l.archive)
   group by l.id
   order by l.archive, l.cree_le desc
   limit 200;
$$;
revoke all on function public.logements_de_mon_agence(boolean)
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.logements_de_mon_agence(boolean) to authenticated;
