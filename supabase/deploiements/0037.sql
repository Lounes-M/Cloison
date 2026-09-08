begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"714c5ca0b6c051bcdd1f33a73a727d6b5664acce2add4e7ecf05359f7fe53c18","indexes":"d2305e5284060be0361121d3ee95e4b046cf4c87522f8a37b2ff40272a3a7251","colonnes":"2af559e16c588ff71ce8aab13e376f2f0ef91ac6634e7b3b4bdd755bd7044205","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"2722a1e4e0a184e56913428da5fc6293cb3f47d68faa16ac23aca3fb954e8a53","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"f527f63fa42aff373bd9b4eb629a74f8aaa4db0412f680eba75452ace8e79af2","declencheurs":"b8a6a3e6651b15f00228517666dc30fa4ce778dc034eb2efd063407dc4e4188e"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
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


do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"4fdd5bd46de2bcb67ccb59ea0a595868cb7732d7df0063f70b9d7381ac0cd411","indexes":"8d6762b21d3b47a8d4ed5019cd3d013e122b317bea9802c7d64a2a9907af514e","colonnes":"c9045994a4b0ccfe2ca6414194fed77c39a829ba410c9ca08ac633fee669cf92","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"e18b2172511360c03b9236bc4e3e6b207b1793a735a952a2308e4a9cd24efd9f","politiques":"6ad22ad09b8963bf1fa4361b04fc691cfd5ee9f0df345b775b94b337cd5ae54a","contraintes":"c854f46ff873978fad614a9db743ad342a35aacce0480ee485d624a3daa37646","declencheurs":"0f47a5809055b8c35d3434296089b5c9b0572327bc7cc03a885ba13024eb07dd"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
