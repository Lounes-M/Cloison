-- Corrections issues de l'audit fonctionnel du 22 novembre 2026.
--
-- 1. Le garant ne se verrouille plus a l'envoi de son lien, mais a son premier
--    acte (brouillon, engagement ou piece). Une adresse mal saisie se corrige
--    donc tant que le garant n'a rien saisi ; le lien precedent est revoque
--    par la reemission.
-- 2. Le loyer fige apres la declaration du garant ne l'est plus que pour le
--    locataire : l'agence, source fiable, le corrige tant que le dossier est
--    ouvert, et la correction est tracee au journal.
-- 3. Le locataire retire un second garant qui n'a rien depose.
-- 4. Un complement demande sur un dossier transmis rouvre tout le groupe a
--    deux garants, pour que le verdict reste calcule sur les deux revenus.
-- 5. Le refus d'un dossier par l'agence est inscrit au journal.

drop trigger invitation_verrouille on public.jetons_actifs;

update public.dossiers d set garant_verrouille = false
 where d.garant_verrouille
   and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
   and not exists(select 1 from public.engagements e where e.dossier_id = d.id)
   and not exists(select 1 from public.pieces p where p.dossier_id = d.id)
   and not exists(select 1 from public.brouillons_engagement b where b.dossier_id = d.id);

-- Un brouillon prouve que le bon destinataire a ouvert le lien : il fige aussi.
create trigger brouillon_verrouille after insert on public.brouillons_engagement
for each row execute function public.verrouiller_donnees_garant();

create or replace function public.proteger_dossier()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.garant_verrouille and old.email_garant is not null and new.email_garant is distinct from old.email_garant then
    raise exception 'Le garant invite ne peut pas etre remplace dans ce dossier.' using errcode='42501';
  end if;
  -- Seule l'agence authentifiee corrige un loyer fige. Le role se lit dans le
  -- jeton : la recopie vers le second dossier s'execute en definer.
  if old.loyer_verrouille and old.loyer_cents is not null
    and new.loyer_cents is distinct from old.loyer_cents
    and nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
      is distinct from 'authenticated' then
    raise exception 'Le loyer est fige apres la declaration du garant.' using errcode='42501';
  end if;
  if current_user in ('authenticated','porteur_lien') and new.statut is distinct from old.statut then
    if current_user <> 'authenticated' or not (
      (old.statut='complet' and new.statut='transmis')
      or (old.statut in ('complet','garant_insuffisant','transmis') and new.statut='refuse')
    ) then raise exception 'Transition interdite.' using errcode='42501'; end if;
  end if;
  if old.statut in ('transmis','signe','refuse','expire') and
    (new.email_garant is distinct from old.email_garant or new.loyer_cents is distinct from old.loyer_cents) then
    raise exception 'Ce dossier est fige.' using errcode='42501';
  end if;
  return new;
end $$;

alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse','ocr_demande',
 'relances_reprises','loyer_corrige','dossier_refuse'));

create function public.tracer_decision_agence() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  action text;
begin
  if claims->>'role' is distinct from 'authenticated' or auth.uid() is null then
    return new;
  end if;
  if new.statut = 'refuse' and old.statut is distinct from 'refuse' then
    action := 'dossier_refuse';
  elsif old.loyer_verrouille and old.loyer_cents is not null
    and new.loyer_cents is distinct from old.loyer_cents then
    action := 'loyer_corrige';
  else
    return new;
  end if;
  insert into public.journal_acces(dossier_id, acteur, acteur_id, action)
  values(new.id, 'agence', auth.uid(), action);
  return new;
end;
$$;
revoke all on function public.tracer_decision_agence()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger decision_agence_tracee after update of statut, loyer_cents on public.dossiers
for each row execute function public.tracer_decision_agence();

create function public.retirer_second_garant() returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.dossiers; s public.dossiers;
begin
  if public.partie_courante() is distinct from 'locataire' then
    raise exception 'Acces refuse.' using errcode='42501';
  end if;
  select * into p from public.dossiers where id=public.dossier_courant() for update;
  if not found or p.dossier_principal is not null
    or p.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then
    return false;
  end if;
  select * into s from public.dossiers where dossier_principal=p.id for update;
  if not found
    or s.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant')
    or s.garant_verrouille then
    return false;
  end if;
  delete from public.dossiers where id=s.id;
  perform public.recalculer_dossier(p.id);
  return true;
end;
$$;
revoke all on function public.retirer_second_garant()
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.retirer_second_garant() to porteur_lien;

-- Le locataire sait si le second garant se corrige ou se retire encore.
create function public.second_garant_libre() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select not s.garant_verrouille
      and s.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
    from public.dossiers s
   where public.partie_courante()='locataire'
     and s.dossier_principal=public.dossier_courant() and s.expire_le>now()), false);
$$;
revoke all on function public.second_garant_libre()
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.second_garant_libre() to porteur_lien;

create or replace function public.demander_complement(la_piece uuid,le_motif text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d uuid;p public.pieces;racine uuid;
begin
 select dossier_id into d from public.pieces where id=la_piece;
 perform 1 from public.dossiers where id=d and agence_id=public.agence_courante()
  and expire_le>now() and statut in ('depot_en_cours','complet','garant_insuffisant','transmis') for update;
 if not found then return false;end if;
 select * into p from public.pieces where id=la_piece and dossier_id=d;
 if not found or le_motif is null or le_motif not in ('illisible','incomplet','incorrect') then return false;end if;
 if exists(select 1 from public.complements_documentaires where piece_initiale=la_piece) then return false;end if;
 insert into public.complements_documentaires(dossier_id,piece_initiale,pieces_ecartees,nature,motif,demande_par)
 values(d,la_piece,array[la_piece],p.type,le_motif,auth.uid());
 update public.dossiers set statut='depot_en_cours' where id=d;
 select coalesce(g.dossier_principal,g.id) into racine from public.dossiers g where g.id=d;
 update public.dossiers set statut='depot_en_cours'
  where (id=racine or dossier_principal=racine) and id<>d and statut='transmis';
 perform public.journaliser(d,'complement_demande',la_piece);
 insert into public.notifications_statut(dossier_id,statut,complement_id,cree_le)
 select d,'complement_demande',c.id,clock_timestamp() from public.complements_documentaires c
 join public.dossiers dossier on dossier.id=c.dossier_id where c.piece_initiale=la_piece and not dossier.demonstration;
 return true;
end $$;

notify pgrst,'reload schema';
