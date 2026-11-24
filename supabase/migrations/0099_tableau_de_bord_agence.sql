-- Le tableau de bord de pilotage de l'agence.
--
-- L'espace agence montrait huit cartes de priorite (0052, 0077) et douze mois
-- de compteurs (0068). Il ne disait pas ou en sont les dossiers en cours,
-- combien de temps ils mettent a etre complets puis signes, lesquels
-- n'avancent plus et qui ils attendent, ni combien de relances sont parties.
--
-- Trois lectures, toutes pour l'agence courante (`agence_courante()`, donc
-- session aal2, adresse confirmee et domaine de l'agence) :
--
--   pilotage_de_mon_agence()          les dossiers en cours par etape, les
--                                     blocages par motif et par partie attendue ;
--   dossiers_bloques_de_mon_agence()  la liste de ces dossiers, 500 au plus ;
--   pilotage_mensuel_de_mon_agence()  douze mois de delais et de relances.
--
-- Ce qui sort : des nombres, et pour les dossiers bloques leur identifiant,
-- leur reference, leur etape, un motif et une date d'activite. L'agence lit
-- deja ces quatre colonnes par la RLS. Aucune adresse, aucun nom, aucun
-- montant, aucun ratio ne passe par ces fonctions.
--
-- Un dossier est « bloque » quand il n'est pas termine et que rien n'y a
-- bouge (`activite_rappel_le`, 0052 et 0089) depuis le seuil de la partie
-- attendue : deux jours pour l'agence, trois pour le locataire, sept pour le
-- garant et pour les signataires. Les relances epuisees (0077, 0079) bloquent
-- sans seuil : plus rien ne partira tout seul. Un seul motif par dossier, le
-- premier de cet ordre, pour que les compteurs s'additionnent :
--
--   remplacement_a_examiner  une piece de remplacement attend l'agence ;
--   paiement                 le locataire n'a pas regle (0085) ;
--   garant_non_designe       le locataire n'a pas designe son garant ;
--   loyer_non_declare        le loyer manque, le ratio ne peut pas se calculer ;
--   relances_epuisees        trois relances sans reponse du garant ;
--   complement_attendu       l'agence a demande une piece, le garant ne l'a
--                            pas fournie ;
--   depot_inacheve           le garant n'a pas fini son depot ;
--   decision_attendue        dossier complet ou a revoir, l'agence ne l'a ni
--                            pris ni refuse ;
--   signature_attendue       dossier pris, pas encore signe.
--
-- Les dossiers de demonstration et ceux d'un second garant (0067) restent
-- hors du compte, comme dans la 0068 : le second garant n'est pas un nouveau
-- candidat. Les dossiers echus ou clos ne comptent plus.
--
-- Les delais et les relances rejoignent les compteurs mensuels de la 0068 :
-- ils ne gardent aucun dossier et survivent donc a la purge. Les delais se
-- mesurent a partir de cette migration, sans rattrapage : `complet_le` a ete
-- pose d'office par la 0087 sur les dossiers anciens, et la date de signature
-- n'etait pas conservee. Les relances deja parties, elles, sont reprises des
-- rappels encore en base.

-- 1. Les compteurs mensuels ---------------------------------------------------

alter table public.activite_agence
  add column complets integer not null default 0 check (complets >= 0),
  add column delai_complet_secondes bigint not null default 0
    check (delai_complet_secondes >= 0),
  add column signatures_mesurees integer not null default 0 check (signatures_mesurees >= 0),
  add column delai_signature_secondes bigint not null default 0
    check (delai_signature_secondes >= 0),
  add column relances_garant integer not null default 0 check (relances_garant >= 0),
  add column relances_locataire integer not null default 0 check (relances_locataire >= 0);

comment on column public.activite_agence.complets is
  'Dossiers devenus complets une premiere fois dans le mois, mesures depuis la 0099.';
comment on column public.activite_agence.signatures_mesurees is
  'Signatures dont le delai est connu. Distinct de `signes`, compte depuis la 0068.';

-- Meme corps que la 0068, plus la premiere completude et le delai de signature.
create or replace function public.compter_activite() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  l_agence uuid := new.agence_id;
  le_mois date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  o integer := 0; p integer := 0; r integer := 0; s integer := 0; c integer := 0;
  k integer := 0;
  delai bigint := 0; delai_complet bigint := 0; delai_signature bigint := 0;
begin
  if l_agence is null or new.demonstration or new.dossier_principal is not null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    o := 1;
    if new.complet_le is not null then k := 1; end if;
  else
    if old.agence_id is null then o := 1; end if;
    -- `complet_le` est pose par le declencheur de la 0087, avant celui-ci.
    -- Un dossier deja complet a son rattachement ne compte pas : l'agence
    -- n'a pas attendu ce depot.
    if old.agence_id is not null and old.complet_le is null and new.complet_le is not null then
      k := 1;
    end if;
    if new.statut is distinct from old.statut then
      if new.statut = 'transmis' then
        p := 1;
        delai := greatest(0, extract(epoch from now() - new.cree_le))::bigint;
      elsif new.statut = 'refuse' then
        r := 1;
      elsif new.statut = 'signe' then
        s := 1;
        delai_signature := greatest(0, extract(epoch from now() - new.cree_le))::bigint;
      elsif new.statut = 'expire' and new.expire_le <= now() and old.expire_le > now() then
        -- La 0066 avance l'echeance dans le meme geste ; une expiration
        -- naturelle ne passe pas par ici, la purge supprime sans changer de
        -- statut.
        c := 1;
      end if;
    end if;
  end if;
  if k = 1 then
    delai_complet := greatest(0, extract(epoch from new.complet_le - new.cree_le))::bigint;
  end if;
  if o + p + r + s + c + k = 0 then
    return new;
  end if;
  insert into public.activite_agence as a(agence_id, mois, ouverts, pris, refuses, signes, clos,
    delai_prise_secondes, complets, delai_complet_secondes, signatures_mesurees,
    delai_signature_secondes)
  values (l_agence, le_mois, o, p, r, s, c, delai, k, delai_complet, s, delai_signature)
  on conflict (agence_id, mois) do update set
    ouverts = a.ouverts + excluded.ouverts,
    pris = a.pris + excluded.pris,
    refuses = a.refuses + excluded.refuses,
    signes = a.signes + excluded.signes,
    clos = a.clos + excluded.clos,
    delai_prise_secondes = a.delai_prise_secondes + excluded.delai_prise_secondes,
    complets = a.complets + excluded.complets,
    delai_complet_secondes = a.delai_complet_secondes + excluded.delai_complet_secondes,
    signatures_mesurees = a.signatures_mesurees + excluded.signatures_mesurees,
    delai_signature_secondes = a.delai_signature_secondes + excluded.delai_signature_secondes;
  return new;
end;
$$;

-- Une relance compte quand son courriel entre en file, comme dans la 0076.
-- Les rappels d'echeance et l'alerte d'epuisement s'adressent a l'agence :
-- ce ne sont pas des relances. Un dossier sans agence n'a pas de compteur.
create function public.compter_relance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.activite_agence as a(agence_id, mois, relances_garant, relances_locataire)
  select r.agence_id, date_trunc('month', now() at time zone 'Europe/Paris')::date,
    (r.nature = 'depot')::integer, (r.nature = 'locataire')::integer
    from public.rappels_dossiers r
    join public.dossiers d on d.id = r.dossier_id
   where r.id = new.rappel_id and r.agence_id is not null
     and r.nature in ('depot', 'locataire') and not d.demonstration
  on conflict (agence_id, mois) do update set
    relances_garant = a.relances_garant + excluded.relances_garant,
    relances_locataire = a.relances_locataire + excluded.relances_locataire;
  return null;
end;
$$;
revoke all on function public.compter_relance()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger relance_comptee after insert on public.courriels_sortants
for each row when (new.rappel_id is not null) execute function public.compter_relance();

-- Les relances deja parties, pour les dossiers encore en base.
insert into public.activite_agence as a(agence_id, mois, relances_garant, relances_locataire)
select r.agence_id, date_trunc('month', r.cree_le at time zone 'Europe/Paris')::date,
  count(*) filter (where r.nature = 'depot')::integer,
  count(*) filter (where r.nature = 'locataire')::integer
  from public.rappels_dossiers r
  join public.dossiers d on d.id = r.dossier_id
 where r.agence_id is not null and r.nature in ('depot', 'locataire') and not d.demonstration
   and exists(select 1 from public.courriels_sortants c where c.rappel_id = r.id)
 group by 1, 2
on conflict (agence_id, mois) do update set
  relances_garant = excluded.relances_garant,
  relances_locataire = excluded.relances_locataire;

-- 2. Les dossiers bloques -----------------------------------------------------

-- Le nombre de jours sans activite a partir duquel la partie attendue bloque.
create function public.seuil_blocage(la_partie text) returns integer
language sql immutable set search_path='' as $$
  select case la_partie
    when 'agence' then 2 when 'locataire' then 3
    when 'garant' then 7 when 'signataires' then 7 end;
$$;

-- Les dossiers bloques d'une agence. Jamais appelee directement : les deux
-- lectures ci-dessous lui passent l'agence courante, et rien d'autre.
create function public.blocages_agence(l_agence uuid)
returns table(id uuid, reference text, statut text, motif text, attend text,
  depuis timestamptz, echeance_proche boolean)
language sql stable security definer set search_path='' as $$
  with motifs as (
    select d.id, d.reference, d.statut, d.activite_rappel_le, d.expire_le,
      case
        when exists(select 1 from public.complements_documentaires c
                     where c.dossier_id = d.id and c.etat = 'fourni')
          then 'remplacement_a_examiner'
        when d.statut in ('ouvert', 'depot_en_cours') then case
          when public.dossier_a_regler(d.id) then 'paiement'
          when d.email_garant is null then 'garant_non_designe'
          when d.loyer_cents is null then 'loyer_non_declare'
          when exists(
            select 1 from public.rappels_dossiers r
             where r.dossier_id = d.id and r.nature = 'depot'
               and r.cree_le > coalesce(d.relances_depuis, '-infinity')
               and exists(select 1 from public.courriels_sortants c where c.rappel_id = r.id)
            having count(*) >= 3 and d.activite_rappel_le <= max(r.cree_le))
            then 'relances_epuisees'
          when exists(select 1 from public.complements_documentaires c
                       where c.dossier_id = d.id and c.etat = 'demande')
            then 'complement_attendu'
          else 'depot_inacheve' end
        when d.statut = 'complet' and d.loyer_cents is null then 'loyer_non_declare'
        when d.statut in ('complet', 'garant_insuffisant') then 'decision_attendue'
        when d.statut = 'transmis' then 'signature_attendue'
      end as motif
      from public.dossiers d
     where l_agence is not null and d.agence_id = l_agence
       and not d.demonstration and d.dossier_principal is null
       and d.expire_le > clock_timestamp()
       and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant', 'transmis')
  ), parties as (
    select m.*,
      case
        when m.motif in ('remplacement_a_examiner', 'decision_attendue') then 'agence'
        when m.motif in ('paiement', 'garant_non_designe', 'loyer_non_declare') then 'locataire'
        when m.motif = 'signature_attendue' then 'signataires'
        else 'garant' end as attend
      from motifs m
  )
  select p.id, p.reference, p.statut, p.motif, p.attend, p.activite_rappel_le,
    p.expire_le <= clock_timestamp() + interval '7 days'
    from parties p
   where p.motif = 'relances_epuisees'
      or p.activite_rappel_le
         <= clock_timestamp() - make_interval(days => public.seuil_blocage(p.attend));
$$;

-- La liste, la plus ancienne inactivite d'abord.
create function public.dossiers_bloques_de_mon_agence()
returns table(id uuid, reference text, statut text, motif text, attend text,
  depuis timestamptz, echeance_proche boolean)
language sql stable security definer set search_path='' as $$
  select b.id, b.reference, b.statut, b.motif, b.attend, b.depuis, b.echeance_proche
    from public.blocages_agence(public.agence_courante()) b
   order by b.depuis, b.id
   limit 500;
$$;

-- 3. La synthese ---------------------------------------------------------------

-- Un instantane : les dossiers en cours par etape, les blocages par motif et
-- par partie attendue. Rend null hors d'une agence.
create function public.pilotage_de_mon_agence() returns jsonb
language sql stable security definer set search_path='' as $$
  with moi as (
    select public.agence_courante() as agence
  ), vivants as (
    select d.statut, d.expire_le
      from public.dossiers d, moi
     where d.agence_id = moi.agence and not d.demonstration and d.dossier_principal is null
       and d.expire_le > clock_timestamp() and d.statut <> 'expire'
  ), bloques as (
    select b.motif, b.attend from moi, public.blocages_agence(moi.agence) b
  )
  select jsonb_build_object(
    'genere_le', clock_timestamp(),
    'etapes', (
      select jsonb_object_agg(e.statut, (select count(*) from vivants v where v.statut = e.statut))
        from unnest(array['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant',
          'transmis', 'signe', 'refuse']) as e(statut)),
    'en_cours', (select count(*) from vivants v where v.statut not in ('signe', 'refuse')),
    'echeances_proches', (
      select count(*) from vivants v
       where v.statut not in ('signe', 'refuse')
         and v.expire_le <= clock_timestamp() + interval '7 days'),
    'bloques', (select count(*) from bloques),
    'blocages', (
      select jsonb_object_agg(m.motif, (select count(*) from bloques b where b.motif = m.motif))
        from unnest(array['remplacement_a_examiner', 'paiement', 'garant_non_designe',
          'loyer_non_declare', 'relances_epuisees', 'complement_attendu', 'depot_inacheve',
          'decision_attendue', 'signature_attendue']) as m(motif)),
    'attendus', (
      select jsonb_object_agg(p.partie, (select count(*) from bloques b where b.attend = p.partie))
        from unnest(array['agence', 'locataire', 'garant', 'signataires']) as p(partie)),
    'seuils', (
      select jsonb_object_agg(p.partie, public.seuil_blocage(p.partie))
        from unnest(array['agence', 'locataire', 'garant', 'signataires']) as p(partie))
  )
  from moi where moi.agence is not null;
$$;

-- Douze mois de delais et de relances, sur le modele de `activite_de_mon_agence`.
create function public.pilotage_mensuel_de_mon_agence()
returns table(mois date, ouverts integer, complets integer, delai_complet_moyen_jours numeric,
  signes integer, signatures_mesurees integer, delai_signature_moyen_jours numeric,
  relances_garant integer, relances_locataire integer)
language sql stable security definer set search_path='' as $$
  with bornes as (
    select public.agence_courante() as agence,
      date_trunc('month', now() at time zone 'Europe/Paris')::date as courant
  ), mois as (
    select (b.courant - make_interval(months => n))::date as mois, b.agence
      from bornes b, generate_series(0, 11) n
     where b.agence is not null
  )
  select m.mois, coalesce(a.ouverts, 0), coalesce(a.complets, 0),
    case when coalesce(a.complets, 0) > 0
      then round(a.delai_complet_secondes::numeric / a.complets / 86400, 1) end,
    coalesce(a.signes, 0), coalesce(a.signatures_mesurees, 0),
    case when coalesce(a.signatures_mesurees, 0) > 0
      then round(a.delai_signature_secondes::numeric / a.signatures_mesurees / 86400, 1) end,
    coalesce(a.relances_garant, 0), coalesce(a.relances_locataire, 0)
    from mois m
    left join public.activite_agence a on a.agence_id = m.agence and a.mois = m.mois
   order by m.mois desc;
$$;

revoke all on function public.seuil_blocage(text), public.blocages_agence(uuid),
  public.dossiers_bloques_de_mon_agence(), public.pilotage_de_mon_agence(),
  public.pilotage_mensuel_de_mon_agence()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.dossiers_bloques_de_mon_agence(),
  public.pilotage_de_mon_agence(), public.pilotage_mensuel_de_mon_agence() to authenticated;
notify pgrst,'reload schema';
