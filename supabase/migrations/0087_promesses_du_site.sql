-- Suites de l'audit des promesses du site (23 novembre 2026).
--
-- Le site dit ce que le produit fait une fois fini. Cinq phrases publiques
-- n'avaient pas, ou pas tout a fait, de mecanisme derriere elles.
--
-- 1. « Vous ne recevez rien tant que le dossier n'est pas complet » (page
--    Agences). L'agence lisait les pieces des le premier depot. Elle ne les
--    lit plus, ni leur cle ni leurs octets, avant que le dossier ait ete
--    complet une premiere fois (`complet_le`). Une demande de complement
--    renvoie le dossier en depot : l'agence garde alors la lecture, sans quoi
--    elle ne pourrait pas examiner le remplacement qu'elle a demande.
--    Le dossier de demonstration, fictif, reste lisible a toute etape.
-- 2. « Efface trois mois apres son ouverture » (confidentialite, conditions).
--    Le paiement repoussait l'echeance a trois mois apres le paiement, donc
--    jusqu'a quatre mois apres l'ouverture. Elle vaut maintenant trois mois
--    apres l'ouverture, paye ou non.
-- 3. « Les empreintes contre les abus durent une heure au plus ». La purge
--    les gardait deux jours ; elle les retire des que la plus longue fenetre,
--    d'une heure, est passee.
-- 4. « La piece d'identite n'est jamais lue par une machine ». L'aide a la
--    lecture (0047) acceptait toute piece : la reservation refuse desormais la
--    piece d'identite, avant tout envoi au prestataire.
-- 5. Les demandes de demonstration n'etaient jamais effacees : la purge retire
--    celles de plus de douze mois.

-- 1. Le dossier complet ------------------------------------------------------

alter table public.dossiers add column complet_le timestamptz;
comment on column public.dossiers.complet_le is
 'Premiere fois ou le depot du garant a ete complet. Avant, l''agence ne lit aucune piece.';

-- Les dossiers deja complets, ou revenus en depot pour un complement, gardent
-- la lecture qu'ils avaient.
update public.dossiers d set complet_le=clock_timestamp()
 where d.statut in ('complet','garant_insuffisant','transmis','signe','refuse')
  or exists(select 1 from public.complements_documentaires c where c.dossier_id=d.id);

create function public.dater_premiere_completude()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.complet_le is null and new.statut in ('complet','garant_insuffisant','transmis','signe','refuse') then
  new.complet_le:=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function public.dater_premiere_completude()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
-- Le nom place ce declencheur apres ceux qui protegent le dossier.
create trigger z_premiere_completude before insert or update of statut on public.dossiers
for each row execute function public.dater_premiere_completude();

alter policy "Une agence lit les pieces de ses dossiers" on public.pieces
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE ((dossiers.agence_id = (select public.agence_courante())) AND ((dossiers.complet_le IS NOT NULL) OR dossiers.demonstration)))));
alter policy "Une agence lit la cle de ses dossiers" on public.cles_dossier
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE ((dossiers.agence_id = (select public.agence_courante())) AND ((dossiers.complet_le IS NOT NULL) OR dossiers.demonstration)))));
alter policy "Une agence lit les octets de ses dossiers" on storage.objects
  using (((bucket_id = 'pieces'::text) AND (EXISTS ( SELECT 1
   FROM public.dossiers d
  WHERE ((d.agence_id = (select public.agence_courante())) AND ((d.complet_le IS NOT NULL) OR d.demonstration) AND (objects.name ~~ ((d.id)::text || '/%'::text)))))));

-- 2. Trois mois apres l'ouverture ---------------------------------------------

-- Meme corps que la 0022, sauf l'echeance : comptee depuis l'ouverture.
create or replace function public.marquer_dossier_paye(le_dossier uuid, la_reference text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare deja text;
begin
  select paiement_ref into deja from public.dossiers where id=le_dossier for update;
  if not found then return false; end if;
  if deja is not null then
    if deja=la_reference then return true; end if;
    raise exception 'Dossier deja regle avec un paiement different.' using errcode='23505';
  end if;
  update public.dossiers set paye_le=now(),paiement_ref=la_reference,
    expire_le=greatest(expire_le,cree_le+interval '3 months') where id=le_dossier;
  return true;
end $$;

-- 3 a 5. Aide a la lecture et purge -------------------------------------------

create or replace function public.reserver_lecture_ocr(la_piece uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 dossier uuid; agence uuid; sujet text; limite integer; atteint integer;
 v_fenetre timestamptz := date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch');
begin
 select d.id,d.agence_id into dossier,agence from public.pieces p
 join public.dossiers d on d.id=p.dossier_id
 where p.id=la_piece and d.agence_id=public.agence_courante()
 and p.type<>'piece_identite'
 and d.expire_le>clock_timestamp() and d.statut<>'expire';
 if dossier is null or auth.uid() is null then return false; end if;
 perform pg_advisory_xact_lock(7047001);
 delete from public.debits where cle like 'ocr:%' and debits.fenetre<v_fenetre;
 for sujet,limite in select * from (values
 ('ocr:acteur:'||auth.uid()::text,5),('ocr:agence:'||agence::text,30),('ocr:global:partage',100)) x(s,l)
 loop
   insert into public.debits(cle,fenetre,compte) values(sujet,v_fenetre,1)
   on conflict(cle,fenetre) do update set compte=public.debits.compte+1 returning compte into atteint;
   if atteint>limite then return false; end if;
 end loop;
 insert into public.journal_acces(dossier_id,acteur,acteur_id,action,piece_id)
 values(dossier,'agence',auth.uid(),'ocr_demande',la_piece);
 return true;
end;
$$;

create or replace function public.purger_les_dossiers_expires()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d record; nombre integer := 0;
begin
  delete from public.journal_administration_agence where id in (
    select id from public.journal_administration_agence where quand < now()-interval '90 days' order by quand limit 5000
  );
  delete from public.debits where (cle, fenetre) in (
    select cle, fenetre from public.debits where fenetre < now()-interval '1 hour' order by fenetre limit 5000
  );
  delete from public.demandes_agence where id in (
    select id from public.demandes_agence where cree_le < now()-interval '12 months' order by cree_le limit 5000
  );
  for d in select id,statut from public.dossiers
    where expire_le < now() and coffre_purge_le is null
    order by expire_le limit 200 for update skip locked loop
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
comment on function public.purger_les_dossiers_expires() is
  'Detruit les cles et met les octets expires en file, deux cents dossiers par passage, et retire les demandes d''agence de plus de douze mois. Le travailleur doit ensuite appeler Storage.remove et acquitter chaque chemin.';
