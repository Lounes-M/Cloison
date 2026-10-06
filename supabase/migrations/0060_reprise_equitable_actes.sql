-- Une tentative de reprise ne doit pas monopoliser la file des actes suivants.
alter table public.actes_signature
 add column traitement_tentatives integer not null default 0 check(traitement_tentatives between 0 and 12),
 add column traitement_apres timestamptz not null default '-infinity',
 add column traitement_dernier timestamptz;

create function public.reinitialiser_reprise_acte() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.etape is distinct from old.etape then
  new.traitement_tentatives := 0;
  new.traitement_apres := '-infinity';
 end if;
 return new;
end;$$;
revoke all on function public.reinitialiser_reprise_acte() from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger reprise_acte_apres_progression before update of etape on public.actes_signature
 for each row execute function public.reinitialiser_reprise_acte();

create or replace function public.actes_a_traiter(le_mode text) returns setof uuid
language sql volatile security definer set search_path='' as $$
 with candidat as (
  select a.id from public.actes_signature a join public.demandes_signature s on s.id=a.id
  join public.dossiers d on d.id=s.dossier_id
  where s.environnement=le_mode and not s.anomalie and d.statut='transmis' and d.expire_le>clock_timestamp()
  and (a.expire_signature>clock_timestamp() or (a.etape='en_cours' and s.etat='done')) and a.operation is null
  and a.traitement_apres<=clock_timestamp()
  and ((a.etape in ('valide','document','signataire','activation') and not d.demonstration and exists(select 1 from public.agences g where g.id=d.agence_id and g.statut='verifiee') and s.etat not in ('canceled','declined','rejected','deleted','expired')) or (a.etape='en_cours' and s.etat='done'))
  order by a.traitement_dernier nulls first,s.cree_le,a.id
  limit 1 for update of a skip locked
 ), reservation as (
  update public.actes_signature a
  set traitement_tentatives=least(12,a.traitement_tentatives+1),
      traitement_dernier=clock_timestamp(),
      traitement_apres=clock_timestamp()+make_interval(secs=>least(3600,300*power(2,least(4,a.traitement_tentatives)))::double precision)
  from candidat c where a.id=c.id returning a.id
 ) select id from reservation;
$$;
-- CREATE OR REPLACE conserve les droits ; les reaffirmer rend le contrat explicite.
revoke all on function public.actes_a_traiter(text) from public,anon,authenticated,porteur_lien,depot_piece,archive_signature,service_role;
grant execute on function public.actes_a_traiter(text) to serveur;
