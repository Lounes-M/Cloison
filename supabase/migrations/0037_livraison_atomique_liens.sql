-- L'intention de livraison est atomique avec l'emission ou le renouvellement.
create table public.livraisons_liens (
 id uuid primary key,
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 partie text not null check (partie in ('locataire','garant')),
 expire_le timestamptz not null,
 cree_le timestamptz not null default now()
);
create index livraisons_liens_dossier on public.livraisons_liens(dossier_id);
alter table public.livraisons_liens enable row level security;
revoke all on public.livraisons_liens from public,anon,authenticated,porteur_lien,serveur,depot_piece;
alter table public.courriels_sortants add column annule_le timestamptz, add column expire_le timestamptz;

create function public.programmer_livraison_lien()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op <> 'INSERT' then
  if tg_op = 'UPDATE' and old.jti = new.jti then return new; end if;
  update public.courriels_sortants set contenu=null,annule_le=now(),a_reconcilier=false
   where id=old.jti and envoye_le is null;
  delete from public.livraisons_liens where id=old.jti;
 end if;
 if tg_op <> 'DELETE' then
  -- Les comptes de demonstration ne recoivent pas de courriel automatique.
  if exists(select 1 from public.dossiers d where d.id=new.dossier_id and not d.demonstration) then
   insert into public.livraisons_liens(id,dossier_id,partie,expire_le)
    values(new.jti,new.dossier_id,new.partie,new.expire_le);
  end if;
  return new;
 end if;
 return old;
end;
$$;
create trigger livraison_lien after insert or update of jti or delete on public.jetons_actifs
for each row execute function public.programmer_livraison_lien();
revoke all on function public.programmer_livraison_lien() from public,anon,authenticated,porteur_lien,serveur,depot_piece;

create function public.liens_a_livrer(le_dossier uuid default null)
returns table(id uuid,dossier_id uuid,partie text,expire_le timestamptz,reference text,destinataire text,demande_par text)
language plpgsql security definer set search_path='' as $$
begin
 delete from public.livraisons_liens l where l.expire_le <= now();
 return query select l.id,l.dossier_id,l.partie,l.expire_le,d.reference,
  case when l.partie='garant' then d.email_garant else d.email_locataire end,d.email_locataire
 from public.livraisons_liens l join public.dossiers d on d.id=l.dossier_id
 join public.jetons_actifs j on j.jti=l.id and j.dossier_id=l.dossier_id and j.partie=l.partie
 where d.expire_le > now() and j.expire_le > now()
  and (le_dossier is null or d.id=le_dossier)
 order by l.cree_le,l.id limit 20;
end;
$$;

create function public.mettre_lien_en_file(identifiant uuid,chiffre text)
returns boolean language plpgsql security definer set search_path='' as $$
declare expiration timestamptz;
begin
 if chiffre is null or length(chiffre)=0 or length(chiffre)>1048576 then
  raise exception 'Contenu chiffre requis' using errcode='check_violation';
 end if;
 -- Le verrou empeche un renouvellement de passer entre ce controle et la file.
 select least(l.expire_le,d.expire_le,j.expire_le) into expiration
 from public.livraisons_liens l join public.dossiers d on d.id=l.dossier_id
 join public.jetons_actifs j on j.jti=l.id and j.dossier_id=l.dossier_id and j.partie=l.partie
 where l.id=identifiant and l.expire_le>now() and d.expire_le>now() and j.expire_le>now()
 for share of j;
 if not found then
  return exists(select 1 from public.courriels_sortants c where c.id=identifiant
   and c.annule_le is null and c.expire_le>now());
 end if;
 insert into public.courriels_sortants(id,contenu,expire_le) values(identifiant,chiffre,expiration)
  on conflict(id) do nothing;
 delete from public.livraisons_liens where id=identifiant;
 return true;
end;
$$;
revoke all on function public.liens_a_livrer(uuid),public.mettre_lien_en_file(uuid,text)
 from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.liens_a_livrer(uuid),public.mettre_lien_en_file(uuid,text) to serveur;
create or replace function public.prendre_courriels(identifiant uuid default null)
returns table(id uuid,contenu text,bail uuid)
language plpgsql security definer set search_path='' as $$
begin
  -- Resend ne garantit l'idempotence que 24 h. Ne jamais rejouer une issue
  -- inconnue au-dela de cette fenetre : elle exige une reconciliation.
  update public.courriels_sortants c set a_reconcilier=true
  where c.envoye_le is null and c.annule_le is null and c.premier_essai < now()-interval '23 hours';
  return query
  with disponibles as (
    select c.id from public.courriels_sortants c
    where c.envoye_le is null and c.annule_le is null and not c.a_reconcilier and (c.expire_le is null or c.expire_le > now())
      and c.prochain_essai <= now()
      and (c.bail_expire_le is null or c.bail_expire_le < now())
      and (identifiant is null or c.id=identifiant)
    order by c.cree_le for update skip locked limit 10
  )
  update public.courriels_sortants c
  set bail=gen_random_uuid(),bail_expire_le=now()+interval '5 minutes',
      premier_essai=coalesce(c.premier_essai,now()),essais=c.essais+1
  from disponibles d where c.id=d.id returning c.id,c.contenu,c.bail;
end;
$$;

create or replace function public.etat_file_courriels()
returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
  update public.courriels_sortants set contenu=null,annule_le=now(),a_reconcilier=false
   where envoye_le is null and annule_le is null and expire_le <= now();
  -- Un lien de capacite expire en sept jours. Ne pas conserver son courriel
  -- indefiniment, meme lorsque l'operateur n'a pas encore reconcilie l'envoi.
  update public.courriels_sortants set contenu=null,a_reconcilier=true
    where envoye_le is null and cree_le < now()-interval '7 days' and contenu is not null;
  select count(*) into n from public.courriels_sortants where a_reconcilier and annule_le is null;
  return n;
end;
$$;
revoke all on function public.etat_file_courriels() from public,anon,authenticated,porteur_lien;
grant execute on function public.etat_file_courriels() to serveur;


create or replace function public.rapport_exploitation()
returns jsonb language sql stable security definer set search_path='' as $$
with acces_recents as (
  select j.acteur_id,j.dossier_id from public.journal_acces j
  join public.dossiers d on d.id=j.dossier_id
  where j.acteur='agence' and j.action='piece_ouverte' and not d.demonstration
    and j.quand >= now()-interval '1 hour' and j.quand <= now()
), cohortes as (
  select d.id,d.agence_id,(d.email_garant is not null) as garant_designe,d.statut
  from public.dossiers d where not d.demonstration
    and d.cree_le >= now()-interval '28 days' and d.cree_le <= now()
)
select jsonb_build_object(
  'version',1,
  'alertes',jsonb_build_object(
    'collaborateurs_acces_intensifs',(select count(*) from (select acteur_id from acces_recents where acteur_id is not null group by acteur_id having count(*) >= 100) x),
    'dossiers_acces_intensifs',(select count(*) from (select dossier_id from acces_recents group by dossier_id having count(*) >= 50) x),
    'purges_en_retard',(select count(*) from public.objets_a_supprimer where cree_le <= now()-interval '1 hour'),
    'courriels_a_reconcilier',(select count(*) from public.courriels_sortants where envoye_le is null and annule_le is null and (a_reconcilier or premier_essai <= now()-interval '23 hours'))+(select count(*) from public.livraisons_liens where cree_le <= now()-interval '1 hour' and expire_le > now())
  ),
  'pilote',jsonb_build_object(
    'jours',28,
    'dossiers_presents',(select count(*) from cohortes),
    'avec_agence',(select count(*) from cohortes where agence_id is not null),
    'garant_designe',(select count(*) from cohortes where garant_designe),
    'avec_piece_presente',(select count(*) from cohortes c where exists(select 1 from public.pieces p where p.dossier_id=c.id)),
    'complets_ou_transmis',(select count(*) from cohortes where statut in ('complet','transmis','signe')),
    'marques_signes',(select count(*) from cohortes where statut='signe')
  )
);
$$;
revoke all on function public.rapport_exploitation() from public,anon,authenticated,porteur_lien;
grant execute on function public.rapport_exploitation() to serveur;

