-- Presence declaree des justificatifs, distincte de leur examen par une agence.
alter table public.engagements add column profil_ressources text not null default 'salarie'
 check (profil_ressources in ('salarie','retraite','independant'));
grant update(profil_ressources) on public.engagements to porteur_lien;

alter table public.pieces drop constraint pieces_type_check;
alter table public.pieces add constraint pieces_type_check check(type in (
 'bulletin_paie','avis_imposition','piece_identite','justificatif_domicile','contrat_travail',
 'pension_retraite','bilan_comptable','attestation_ressources','activite_independante'));
alter table public.pieces add column nombre_documents smallint not null default 1;
alter table public.pieces add constraint nombre_documents_declare check(
 nombre_documents between 1 and case type when 'bulletin_paie' then 3 when 'bilan_comptable' then 2 else 1 end);

create or replace function public.pieces_suffisantes(le_dossier uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with volumes as (
  select p.type,sum(p.nombre_documents) n from public.pieces p where p.dossier_id=le_dossier group by p.type
 ), profil as (
  select coalesce((select e.profil_ressources from public.engagements e where e.dossier_id=le_dossier),'salarie') valeur
 )
 select (select count(*) from volumes where type in ('avis_imposition','piece_identite','justificatif_domicile'))=3
 and case (select valeur from profil)
  when 'salarie' then exists(select 1 from volumes where type='bulletin_paie' and n>=3)
  when 'retraite' then exists(select 1 from volumes where type='pension_retraite')
  when 'independant' then exists(select 1 from volumes where type='activite_independante')
   and (exists(select 1 from volumes where type='bilan_comptable' and n>=2)
    or exists(select 1 from volumes where type='attestation_ressources'))
  else false end;
$$;
revoke all on function public.pieces_suffisantes(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create trigger profil_recalcule_le_dossier after update of profil_ressources on public.engagements
 for each row execute function public.declenche_recalcul_engagement();
create trigger nombre_documents_recalcule_le_dossier after update of nombre_documents on public.pieces
 for each row execute function public.declenche_recalcul_piece();

-- La correction d'un PDF groupe ne modifie ni objet, ni nature, ni identite.
create function public.declarer_nombre_documents(la_piece uuid,le_nombre integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare d uuid; lignes integer;
begin
 if public.partie_courante() is distinct from 'garant' then return false;end if;
 d:=public.dossier_courant();
 if d is null then return false;end if;
 perform 1 from public.dossiers where id=d and expire_le>now()
  and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant') for update;
 if not found then return false;end if;
 if le_nombre is null or le_nombre not between 1 and 3 then raise exception 'Nombre de documents invalide';end if;
 update public.pieces set nombre_documents=le_nombre where id=la_piece and dossier_id=d;
 get diagnostics lignes=row_count;
 return lignes=1;
end $$;
revoke all on function public.declarer_nombre_documents(uuid,integer) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.declarer_nombre_documents(uuid,integer) to porteur_lien;

-- Aucune inference du nombre de bulletins dans les fichiers deja deposes.
-- Seuls les dossiers encore ouverts sont recalcules ; aucun dossier transmis n'est rouvert.
do $recalcul$ declare d record;begin
 for d in select id from public.dossiers where statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
 loop perform public.recalculer_dossier(d.id);end loop;
end $recalcul$;
