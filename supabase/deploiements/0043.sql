begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"1a628b0a8f7fd6453d602dc85e4bb4b9d75d836de3fb9a1384dc09101af0303d","indexes":"3ad6ffd45d363f5874c15a59e00aef16544d49a3766a96e134213064598ccd3e","colonnes":"776479c4f519d3b72a49709982f4a9044546a249a62c0b6a42164a99630c45ba","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"7d8d2cca100ab5282380eb3599f93dfb946081faf14182817b55e492886e80e2","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"781cad13c681583390f5e0130ba2567838f40bc3abdd58fb9dde6d7dd2fb70b4","declencheurs":"7dc7e6a22fb7acd2cb6898440e2da920c34932cfd023f8450bb33366b9b07636"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
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

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"1a628b0a8f7fd6453d602dc85e4bb4b9d75d836de3fb9a1384dc09101af0303d","indexes":"3ad6ffd45d363f5874c15a59e00aef16544d49a3766a96e134213064598ccd3e","colonnes":"99310b6b71bb65bdd72782c38896df4987e2a66881e1eed7c298e071955bc924","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ae6160f61e491f30dd00269bebd70bd5e7025cef952080e1a1454aa7f3911756","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"3c53b9d89dd32c78b60d60a7f5665a6302723d5c3eb8eb76725923407618efb8","declencheurs":"b5ef5b7216a1428580cddb000914ab6be17a0667645b15ee1edebd2e223d3e71"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
