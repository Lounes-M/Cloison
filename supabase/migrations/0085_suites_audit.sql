-- Suites de l'audit fonctionnel du 22 novembre 2026.
--
-- 1. Le locataire et le garant sont prevenus sept jours avant l'echeance de
--    leur dossier. Jusqu'ici seuls les collaborateurs d'une agence pouvaient
--    l'etre, si l'agence avait active le rappel (0052) : un dossier sans
--    agence, ou transmis en attente de signature, pouvait etre purge sans que
--    personne ne l'ait vu venir. L'annonce ne depend d'aucun reglage d'agence,
--    part une seule fois par echeance et ne prolonge rien.
-- 2. Une notification Docage rejouee n'ajoute plus de ligne au registre.
--    Docage ne donne aucun identifiant d'evenement : la route en tirait un au
--    hasard a chaque appel. L'identifiant derive maintenant de la transaction
--    et de son etat, et un rejeu ne fait que reveiller la lecture.
-- 3. Le paiement du locataire ne se contourne plus par un rattachement. Le
--    dossier reste gratuit quand l'agence l'invite : elle l'ouvre elle-meme,
--    ou le locataire entre par le lien de candidature d'un logement. Un
--    locataire qui rattache seul son dossier a une agence, par son nom de
--    domaine, regle son dossier avant que le lien du garant parte. Les
--    dossiers deja rattaches avant cette migration gardent leur dispense.

create table public.alertes_echeance (
 dossier_id uuid primary key references public.dossiers(id) on delete cascade,
 expiration timestamptz not null,
 cree_le timestamptz not null default clock_timestamp()
);
alter table public.alertes_echeance enable row level security;
revoke all on public.alertes_echeance
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Les dossiers dont l'echeance approche et que personne n'a encore annonces.
-- `secondaire` : le dossier d'un second garant (0067), dont le locataire est
-- deja prevenu par le dossier principal.
create function public.echeances_a_annoncer()
returns table(dossier_id uuid,reference text,email_locataire text,email_garant text,expiration timestamptz,secondaire boolean)
language sql stable security definer set search_path='' as $$
 select d.id,d.reference,d.email_locataire::text,d.email_garant::text,d.expire_le,d.dossier_principal is not null
 from public.dossiers d
 where not d.demonstration
  and d.expire_le>clock_timestamp()
  and d.expire_le<=clock_timestamp()+interval '7 days'
  and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis')
  and not exists(select 1 from public.alertes_echeance a where a.dossier_id=d.id and a.expiration=d.expire_le)
 order by d.expire_le,d.id limit 20;
$$;

-- Acquitte l'annonce une fois ses courriels en file. L'echeance attendue
-- protege d'un dossier prolonge entre la lecture et l'acquittement (un
-- paiement repousse l'echeance) : il sera annonce a sa nouvelle date.
create function public.acquitter_alerte_echeance(le_dossier uuid,l_expiration timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into public.alertes_echeance(dossier_id,expiration)
 select d.id,d.expire_le from public.dossiers d where d.id=le_dossier and d.expire_le=l_expiration
 on conflict(dossier_id) do update set expiration=excluded.expiration,cree_le=clock_timestamp();
 return found;
end;$$;

revoke all on function public.echeances_a_annoncer(),public.acquitter_alerte_echeance(uuid,timestamptz)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.echeances_a_annoncer(),public.acquitter_alerte_echeance(uuid,timestamptz) to serveur;

-- Reveil Docage : un identifiant stable par transaction et par etat. Comme
-- pour `enregistrer_evenement_signature`, l'evenement ne change jamais l'etat
-- du dossier ; il avance seulement la prochaine lecture authentifiee.
create function public.enregistrer_reveil_docage(le_mode text,la_reference uuid,le_statut text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if le_mode is null or le_mode not in ('sandbox','production') or la_reference is null or le_statut is null
  or le_statut not in ('draft','approval','ongoing','paused','rejected','declined','canceled','expired','deleted','done') then
  raise exception 'Notification signature invalide';
 end if;
 insert into public.evenements_signature(environnement,id,reference_fournisseur,etat,survenu_le)
 values(le_mode,pg_catalog.md5('docage/'||la_reference::text||'/'||le_statut)::uuid,la_reference,le_statut,clock_timestamp())
 on conflict(environnement,id) do nothing;
 update public.demandes_signature set revision=revision+1,prochaine_lecture=clock_timestamp()
 where environnement=le_mode and reference_fournisseur=la_reference;
 return jsonb_build_object('enregistre',true,'anomalie',false);
end;$$;
revoke all on function public.enregistrer_reveil_docage(text,uuid,text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.enregistrer_reveil_docage(text,uuid,text) to serveur;

-- Le rattachement decide par le locataire seul, sans invitation de l'agence.
alter table public.dossiers add column rattache_par_locataire boolean not null default false;
comment on column public.dossiers.rattache_par_locataire is
 'Vrai quand le locataire a rattache lui-meme son dossier a une agence (0022) : le rattachement ne le dispense pas du paiement.';

-- Le lien du garant attend-il un paiement ? Juge sur le dossier principal :
-- le dossier d'un second garant (0067) suit celui dont il depend.
create function public.dossier_a_regler(le_dossier uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
  select not r.demonstration and r.paye_le is null and (r.agence_id is null or r.rattache_par_locataire)
  from public.dossiers x join public.dossiers r on r.id=coalesce(x.dossier_principal,x.id)
  where x.id=le_dossier),false);
$$;
revoke all on function public.dossier_a_regler(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

create or replace function public.rattacher_mon_dossier(domaine_agence text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.dossiers; a public.agences;
begin
  if public.partie_courante() is distinct from 'locataire' then
    raise exception 'Acces refuse.' using errcode='42501';
  end if;
  select * into d from public.dossiers where id=public.dossier_courant() for update;
  if not found or d.agence_id is not null or d.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then
    raise exception 'Rattachement indisponible.' using errcode='42501';
  end if;
  select * into a from public.agences where domaine=lower(trim(domaine_agence)) and statut='verifiee';
  if not found then raise exception 'Agence verifiee introuvable.' using errcode='42501'; end if;
  update public.dossiers set agence_id=a.id,rattache_par_locataire=true where id=d.id;
  perform public.recalculer_dossier(d.id);
  return a.nom;
end $$;

-- Entrer par le lien de candidature d'un logement est une invitation de
-- l'agence : la dispense revient, meme apres un rattachement fait seul.
create function public.candidature_dispense_du_paiement()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.logement_id is not null and old.logement_id is null then new.rattache_par_locataire:=false;end if;
 return new;
end $$;
revoke all on function public.candidature_dispense_du_paiement()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger candidature_dispense before update of logement_id on public.dossiers
for each row execute function public.candidature_dispense_du_paiement();

create or replace function public.emettre_jeton(
  le_dossier uuid,
  la_partie text,
  duree interval
)
returns table (jti uuid, expire_le timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nouveau_jti uuid := gen_random_uuid();
begin
  if la_partie not in ('locataire', 'garant') then
    raise exception 'Partie inconnue : %', la_partie;
  end if;

  -- Le lien du garant est ce que le locataire achete. Un dossier ouvert a
  -- l'invitation d'une agence, ou de demonstration, n'attend rien de lui ; un
  -- dossier qu'il a ouvert lui-meme, meme rattache ensuite, si.
  if la_partie = 'garant' and public.dossier_a_regler(le_dossier) then
    raise exception 'Ce dossier n''est pas encore regle : le lien du garant attend le paiement.'
      using errcode = '42501';
  end if;

  return query
  insert into public.jetons_actifs as j (dossier_id, partie, jti, expire_le)
  select x.id, la_partie, nouveau_jti, least(now() + duree, x.expire_le)
    from public.dossiers x
   where x.id = le_dossier
  on conflict (dossier_id, partie) do update
     set jti       = excluded.jti,
         emis_le   = now(),
         expire_le = excluded.expire_le
  returning j.jti, j.expire_le;

  if not found then
    raise exception 'Dossier introuvable.';
  end if;
end;
$$;

create or replace function public.retrouver_lien_garant(courriel text, reference_dossier text)
returns table(dossier_id uuid)
language plpgsql security definer set search_path='' as $$
declare d public.dossiers;
begin
  if courriel is null or reference_dossier is null or length(courriel)>180
    or length(reference_dossier)>100 then
    return;
  end if;
  select * into d from public.dossiers x
   where x.email_garant=lower(trim(courriel)) and x.reference=trim(reference_dossier)
     and x.expire_le>now() and not x.demonstration
     and not public.dossier_a_regler(x.id)
   for update;
  if not found then return; end if;
  perform 1 from public.emettre_jeton(d.id,'garant','7 days');
  return query select d.id;
end $$;

notify pgrst,'reload schema';
