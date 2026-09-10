-- Les motifs et references documentaires ne sont lisibles que par le garant et son agence.
create table public.complements_documentaires (
 id uuid primary key default gen_random_uuid(),
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 piece_initiale uuid not null,
 pieces_ecartees uuid[] not null,
 nature text not null,
 motif text not null check(motif in ('illisible','incomplet','incorrect')),
 demande_par uuid references auth.users(id) on delete set null,
 cree_le timestamptz not null default clock_timestamp(),
 attendu_depuis timestamptz not null default clock_timestamp(),
 etat text not null default 'demande' check(etat in ('demande','fourni','valide')),
 piece_fournie uuid,
 fourni_le timestamptz,
 valide_le timestamptz,
 valide_par uuid references auth.users(id) on delete set null,
 check ((etat='demande' and piece_fournie is null and fourni_le is null and valide_le is null)
 or (etat='fourni' and piece_fournie is not null and fourni_le is not null and valide_le is null)
 or (etat='valide' and piece_fournie is not null and fourni_le is not null and valide_le is not null))
);
create unique index complement_initial_unique on public.complements_documentaires(piece_initiale);
create unique index complement_remplacement_unique on public.complements_documentaires(piece_fournie) where piece_fournie is not null;
create index complements_dossier on public.complements_documentaires(dossier_id,cree_le);
alter table public.complements_documentaires enable row level security;
revoke all on public.complements_documentaires from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant select on public.complements_documentaires to authenticated,porteur_lien;
create policy "Agence du dossier lit les complements" on public.complements_documentaires for select to authenticated
 using(dossier_id in(select id from public.dossiers where agence_id=public.agence_courante()));
create policy "Garant du dossier lit les complements" on public.complements_documentaires for select to porteur_lien
 using(public.partie_courante()='garant' and dossier_id=public.dossier_courant());

alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse'));

alter function public.pieces_suffisantes(uuid) rename to pieces_declarees_suffisantes;
create or replace function public.pieces_declarees_suffisantes(le_dossier uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with volumes as (
  select p.type,sum(p.nombre_documents) n from public.pieces p where p.dossier_id=le_dossier and not exists(select 1 from public.complements_documentaires c where p.id=any(c.pieces_ecartees)) group by p.type
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

create function public.pieces_suffisantes(le_dossier uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.pieces_declarees_suffisantes(le_dossier) and not exists(
 select 1 from public.complements_documentaires where dossier_id=le_dossier and etat<>'valide');
$$;
revoke all on function public.pieces_suffisantes(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;

alter table public.notifications_statut add column complement_id uuid references public.complements_documentaires(id) on delete cascade;

create function public.demander_complement(la_piece uuid,le_motif text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d uuid;p public.pieces;
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
 perform public.journaliser(d,'complement_demande',la_piece);
 insert into public.notifications_statut(dossier_id,statut,complement_id,cree_le)
 select d,'complement_demande',c.id,clock_timestamp() from public.complements_documentaires c
 join public.dossiers dossier on dossier.id=c.dossier_id where c.piece_initiale=la_piece and not dossier.demonstration;
 return true;
end $$;
revoke all on function public.demander_complement(uuid,text) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.demander_complement(uuid,text) to authenticated;

create function public.fournir_complement(la_demande uuid,la_piece uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare d uuid;c public.complements_documentaires;p public.pieces;
begin
 if public.partie_courante() is distinct from 'garant' then return false;end if;
 d:=public.dossier_courant();
 perform 1 from public.dossiers where id=d and expire_le>now()
  and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant') for update;
 if not found then return false;end if;
 select * into c from public.complements_documentaires where id=la_demande and dossier_id=d and etat='demande';
 if not found then return false;end if;
 select * into p from public.pieces where id=la_piece and dossier_id=d and type=c.nature
  and id<>c.piece_initiale and depose_le>c.attendu_depuis;
 if not found then return false;end if;
 if exists(select 1 from public.complements_documentaires where piece_fournie=la_piece) then return false;end if;
 update public.complements_documentaires set etat='fourni',piece_fournie=la_piece, fourni_le=clock_timestamp() where id=c.id;
 perform public.journaliser(d,'complement_fourni',la_piece);
 insert into public.notifications_statut(dossier_id,statut,complement_id,cree_le)
 select d,'complement_fourni',c.id,clock_timestamp() from public.dossiers where id=d and not demonstration;
 return true;
end $$;
revoke all on function public.fournir_complement(uuid,uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.fournir_complement(uuid,uuid) to porteur_lien;

create function public.valider_complement(la_demande uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare d uuid;c public.complements_documentaires;
begin
 select dossier_id into d from public.complements_documentaires where id=la_demande;
 perform 1 from public.dossiers where id=d and agence_id=public.agence_courante()
  and expire_le>now() and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant') for update;
 if not found then return false;end if;
 select * into c from public.complements_documentaires where id=la_demande and dossier_id=d and etat='fourni';
 if not found or not exists(select 1 from public.pieces where id=c.piece_fournie and dossier_id=d) then return false;end if;
 update public.complements_documentaires set etat='valide',valide_le=clock_timestamp(),valide_par=auth.uid() where id=c.id;
 perform public.journaliser(d,'complement_valide',c.piece_fournie);
 perform public.recalculer_dossier(d);
 return true;
end $$;
revoke all on function public.valider_complement(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.valider_complement(uuid) to authenticated;

-- Retirer un remplacement, meme valide, impose un nouvel examen.
create function public.retirer_remplacement_complement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.dossiers where id=old.dossier_id for update;
 update public.complements_documentaires set etat='demande',piece_fournie=null, fourni_le=null,valide_le=null,valide_par=null
 where dossier_id=old.dossier_id and piece_fournie=old.id;
 return old;
end $$;
revoke all on function public.retirer_remplacement_complement() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
create trigger remplacement_retire before delete on public.pieces for each row execute function public.retirer_remplacement_complement();

create function public.refuser_complement(la_demande uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare d uuid;c public.complements_documentaires;
begin
 select dossier_id into d from public.complements_documentaires where id=la_demande;
 perform 1 from public.dossiers where id=d and agence_id=public.agence_courante()
  and expire_le>now() and statut in ('ouvert','depot_en_cours','complet','garant_insuffisant') for update;
 if not found then return false;end if;
 select * into c from public.complements_documentaires where id=la_demande and dossier_id=d and etat='fourni';
 if not found then return false;end if;
 perform public.journaliser(d,'complement_refuse',c.piece_fournie);
 update public.complements_documentaires set etat='demande',piece_fournie=null, fourni_le=null,
  attendu_depuis=clock_timestamp(),pieces_ecartees=array_append(pieces_ecartees,c.piece_fournie) where id=c.id;
 insert into public.notifications_statut(dossier_id,statut,complement_id,cree_le)
 select d,'complement_demande',c.id,clock_timestamp() from public.dossiers where id=d and not demonstration;
 return true;
end $$;
revoke all on function public.refuser_complement(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.refuser_complement(uuid) to authenticated;

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
      where a.id=d.agence_id and a.statut='verifiee'
      and u.email_confirmed_at is not null
      and split_part(lower(u.email),'@',2)=lower(a.domaine))
  from public.notifications_statut n join public.dossiers d on d.id=n.dossier_id
  where d.expire_le > now() and (le_dossier is null or n.dossier_id=le_dossier)
  order by n.cree_le,n.id limit 20;
$$;
