create table public.traitements_actes (
 nom text primary key check(nom in ('signature','archives','reglements')),
 confirme_le timestamptz,
 reussi boolean not null default false
);
alter table public.traitements_actes enable row level security;
revoke all on public.traitements_actes from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
insert into public.traitements_actes(nom) values('signature'),('archives'),('reglements');
create function public.confirmer_traitement_actes(le_nom text,reussite boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 with confirmation as (
  update public.traitements_actes set confirme_le=clock_timestamp(),reussi=reussite
  where nom=le_nom and reussite is not null returning nom
 ) select exists(select 1 from confirmation);
$$;
create function public.etat_traitements_actes() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'version',1,
  'traitements',(select jsonb_object_agg(nom,jsonb_build_object('confirme_le',confirme_le,'reussi',reussi)) from public.traitements_actes),
  'reprises_a_examiner',(select count(*) from public.actes_signature where traitement_tentatives>=3 and etape in ('valide','document','signataire','activation','en_cours') and conserver_jusqu_au>clock_timestamp())
 );
$$;
revoke all on function public.confirmer_traitement_actes(text,boolean),public.etat_traitements_actes() from public,anon,authenticated,porteur_lien,depot_piece,archive_signature,service_role;
grant execute on function public.confirmer_traitement_actes(text,boolean),public.etat_traitements_actes() to serveur;
