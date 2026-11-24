-- La colocation, suite : solvabilite mise en commun et garant commun.
--
-- La 0092 jugeait chaque colocataire seul, avec ses garants, et donnait un
-- dossier et un acte par colocataire. Deux choses manquaient (ADR 0020,
-- « Limites ») :
--
-- 1. La solvabilite mise en commun. Dans un bail solidaire ou chaque caution
--    repond du loyer entier, l'agence peut juger les garants ensemble : la
--    somme de leurs revenus contre le loyer total. Elle le choisit par
--    colocation (`solvabilite = 'commune'`), et seulement en etendue
--    `loyer_entier` : en etendue `part`, le garant d'un colocataire ne repond
--    pas de la part d'un autre, et ses revenus ne peuvent pas la couvrir.
--    Le verdict est alors le meme pour tous les dossiers de la colocation, et
--    ne se prend que lorsque chaque garant a tout depose.
--
-- 2. Le garant commun. Quand plusieurs colocataires ont le meme garant, ils
--    partagent un seul dossier : `dossiers.colocataires_garantis` dit combien
--    ce dossier en couvre. Le garant depose, s'engage et signe une seule
--    fois, et son acte nomme chacun. Rien n'est multiplie a l'interieur du
--    dossier : les colocataires couverts sans dossier propre n'ont ni lien ni
--    adresse en base, l'agence saisit leur nom dans l'acte.

-- ---------------------------------------------------------------------------
-- 1. Le garant commun : un dossier couvre plusieurs colocataires
-- ---------------------------------------------------------------------------

alter table public.dossiers
  add column colocataires_garantis smallint not null default 1
    check (colocataires_garantis between 1 and 8);
comment on column public.dossiers.colocataires_garantis is
  'Nombre de colocataires que couvre le garant de ce dossier. Plus de un : garant commun, un seul acte.';
grant update (colocataires_garantis) on public.dossiers to authenticated;

-- Reprend la 0092 et y ajoute le garant commun : le plafond de huit compte
-- des colocataires, non des dossiers, et le nombre couvert ne bouge plus une
-- fois le dossier pris ou la mention du garant saisie.
create or replace function public.verifier_colocation_du_dossier() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.colocations; entre boolean; change boolean;
begin
  if new.colocation_id is null then
    if new.colocataires_garantis <> 1 then
      -- Le dossier qui quitte sa colocation redevient un dossier seul.
      if tg_op = 'UPDATE' and old.colocation_id is not null then
        new.colocataires_garantis := 1;
      else
        raise exception 'Le garant commun n''existe que dans une colocation.' using errcode='42501';
      end if;
    end if;
    return new;
  end if;
  entre := tg_op = 'INSERT' or old.colocation_id is distinct from new.colocation_id;
  change := tg_op = 'UPDATE' and new.colocataires_garantis is distinct from old.colocataires_garantis;

  -- Le loyer d'un colocataire se regle par l'agence : il decoule du bail.
  if not entre and new.loyer_cents is distinct from old.loyer_cents
     and public.partie_courante() is not null then
    raise exception 'Le loyer d''une colocation se regle par l''agence.' using errcode='42501';
  end if;

  if new.dossier_principal is not null then
    raise exception 'La colocation se rattache au dossier principal.' using errcode='42501';
  end if;
  if new.demonstration then
    raise exception 'Pas de colocation en demonstration.' using errcode='42501';
  end if;

  select * into c from public.colocations k where k.id = new.colocation_id for update;
  if c.id is null or c.agence_id is distinct from new.agence_id then
    raise exception 'Colocation inconnue pour cette agence.' using errcode='42501';
  end if;

  -- Le garant qui a saisi sa mention sait de qui il se porte caution : le
  -- nombre de colocataires couverts ne change plus derriere lui.
  if change and not entre and (
       old.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant')
       or exists(select 1 from public.engagements e
                  where e.dossier_id = new.id and e.mention is not null)) then
    raise exception 'Le garant commun ne se modifie plus sur ce dossier.' using errcode='42501';
  end if;

  if entre then
    if new.expire_le <= now()
       or new.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then
      raise exception 'Ce dossier ne peut plus rejoindre une colocation.' using errcode='42501';
    end if;
    -- Une colocation dont un acte est signe est faite : on n'y ajoute plus.
    if exists(select 1 from public.dossiers d
               where d.colocation_id = c.id and d.id <> new.id and d.statut = 'signe') then
      raise exception 'Cette colocation est deja signee.' using errcode='42501';
    end if;
    -- Deux colocataires distincts, et aucun n'est le garant d'un autre.
    if exists(select 1 from public.dossiers d
               where d.colocation_id = c.id and d.id <> new.id and d.expire_le > now()
                 and d.statut not in ('refuse','expire')
                 and (d.email_locataire = new.email_locataire
                   or d.email_garant = new.email_locataire
                   or d.email_locataire = new.email_garant)) then
      raise exception 'Cette adresse figure deja dans la colocation.' using errcode='42501';
    end if;
  end if;

  if (entre or change)
     and (select coalesce(sum(d.colocataires_garantis), 0) from public.dossiers d
           where d.colocation_id = c.id and d.id <> new.id and d.expire_le > now()
             and d.statut not in ('refuse','expire')) + new.colocataires_garantis > 8 then
    raise exception 'Une colocation compte au plus huit colocataires.' using errcode='42501';
  end if;

  if c.etendue = 'loyer_entier' then
    new.loyer_cents := c.loyer_total_cents;
  end if;
  return new;
end;
$$;

drop trigger colocation_du_dossier on public.dossiers;
create trigger colocation_du_dossier
before insert or update of colocation_id, agence_id, dossier_principal, loyer_cents, demonstration,
  colocataires_garantis
on public.dossiers for each row execute function public.verifier_colocation_du_dossier();

-- ---------------------------------------------------------------------------
-- 2. La solvabilite mise en commun
-- ---------------------------------------------------------------------------

alter table public.colocations
  add column solvabilite text not null default 'individuelle'
    check (solvabilite in ('individuelle', 'commune')),
  add constraint solvabilite_commune_sur_bail_solidaire
    check (solvabilite = 'individuelle' or etendue = 'loyer_entier');
comment on column public.colocations.solvabilite is
  'individuelle : chaque colocataire est juge avec ses garants. commune : la somme des revenus de tous les garants contre le loyer total, bail solidaire seulement.';

grant insert (solvabilite) on public.colocations to authenticated;
grant update (solvabilite) on public.colocations to authenticated;
create policy "Une agence regle la solvabilite de ses colocations"
  on public.colocations for update to authenticated
  using (agence_id = (select public.agence_courante()))
  with check (agence_id = (select public.agence_courante()));

-- Le verdict commun : tous les dossiers ouverts de la colocation, et leurs
-- seconds garants, sont juges ensemble. Les dossiers deja pris gardent leur
-- statut et leurs revenus comptent toujours ; ceux qui sont refuses ou echus
-- ne comptent plus. Le ratio individuel reste ecrit sur chaque engagement,
-- pour que l'agence voie ce que chacun apporte.
create function public.recalculer_colocation(la_colocation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c record;
  m record;
  total bigint := 0;
  tous boolean := true;
  ouverts uuid[] := '{}';
  verdict text;
begin
  select k.id, k.loyer_total_cents, coalesce(a.seuil_ratio, 3.00) as seuil into c
    from public.colocations k
    left join public.agences a on a.id = k.agence_id
   where k.id = la_colocation and k.solvabilite = 'commune';
  if c.id is null then
    return;
  end if;

  -- Meme ordre de verrouillage que `recalculer_dossier` : par identifiant.
  for m in
    select d.id, d.statut, d.loyer_cents, e.revenu_net_mensuel_cents as revenu
      from public.dossiers d
      left join public.engagements e on e.dossier_id = d.id
     where (d.colocation_id = la_colocation
            or d.dossier_principal in (select p.id from public.dossiers p
                                        where p.colocation_id = la_colocation))
       and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant',
                        'transmis', 'signe')
     order by d.id
       for update of d
  loop
    if m.statut in ('transmis', 'signe') then
      total := total + coalesce(m.revenu, 0);
      continue;
    end if;
    ouverts := ouverts || m.id;
    if m.loyer_cents is null or m.revenu is null then
      update public.engagements set ratio = null, calcule_le = null
       where dossier_id = m.id and ratio is not null;
      tous := false;
    else
      -- Tronque, jamais arrondi : voir la 0011.
      update public.engagements
         set ratio = least(trunc(m.revenu::numeric / m.loyer_cents::numeric, 2), 999.99),
             calcule_le = now()
       where dossier_id = m.id;
      total := total + m.revenu;
      if not public.pieces_suffisantes(m.id) then
        tous := false;
      end if;
    end if;
  end loop;

  if tous then
    verdict := case
      when least(trunc(total::numeric / c.loyer_total_cents::numeric, 2), 999.99) >= c.seuil
        then 'complet'
      else 'garant_insuffisant' end;
    update public.dossiers set statut = verdict
     where id = any(ouverts) and statut <> verdict;
  else
    -- Un garant n'a pas fini quelque part : aucun verdict commun ne tient.
    update public.dossiers set statut = 'depot_en_cours'
     where id = any(ouverts) and statut in ('complet', 'garant_insuffisant');
  end if;
end;
$$;
revoke all on function public.recalculer_colocation(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- La 0067, plus un aiguillage : le dossier d'une colocation a solvabilite
-- commune est juge avec toute la colocation. Chaque appelant existant (piece,
-- revenu, loyer, seuil, complement) passe par ici et n'a pas a le savoir.
create or replace function public.recalculer_dossier(le_dossier uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  racine uuid;
  commune uuid;
  m record;
  loyer bigint;
  seuil numeric(4, 2);
  total bigint := 0;
  complet_groupe boolean := true;
  verdict text;
begin
  select coalesce(d.dossier_principal, d.id) into racine
    from public.dossiers d
   where d.id = le_dossier
     and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant');
  -- Absent, ou parti : un dossier parti ne bouge plus.
  if racine is null then
    return;
  end if;

  select k.id into commune
    from public.dossiers r
    join public.colocations k on k.id = r.colocation_id
   where r.id = racine and k.solvabilite = 'commune';
  if commune is not null then
    perform public.recalculer_colocation(commune);
    return;
  end if;

  for m in
    select d.id, d.loyer_cents, coalesce(a.seuil_ratio, 3.00) as seuil,
           e.revenu_net_mensuel_cents as revenu
      from public.dossiers d
      left join public.agences a on a.id = d.agence_id
      left join public.engagements e on e.dossier_id = d.id
     where (d.id = racine or d.dossier_principal = racine)
       and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant')
     order by d.id
       for update of d
  loop
    if m.loyer_cents is null or m.revenu is null then
      update public.engagements set ratio = null, calcule_le = null
       where dossier_id = m.id and ratio is not null;
      complet_groupe := false;
    else
      -- Tronque, jamais arrondi : voir la 0011.
      update public.engagements
         set ratio = least(trunc(m.revenu::numeric / m.loyer_cents::numeric, 2), 999.99),
             calcule_le = now()
       where dossier_id = m.id;
      total := total + m.revenu;
      loyer := m.loyer_cents;
      seuil := m.seuil;
      if not public.pieces_suffisantes(m.id) then
        complet_groupe := false;
      end if;
    end if;
  end loop;

  if complet_groupe and loyer is not null then
    verdict := case
      when least(trunc(total::numeric / loyer::numeric, 2), 999.99) >= seuil then 'complet'
      else 'garant_insuffisant' end;
    update public.dossiers set statut = verdict
     where (id = racine or dossier_principal = racine)
       and statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant')
       and statut <> verdict;
  else
    -- Une piece ou un terme manque quelque part : aucun verdict ne tient.
    update public.dossiers set statut = 'depot_en_cours'
     where (id = racine or dossier_principal = racine)
       and statut in ('complet', 'garant_insuffisant');
  end if;
end;
$$;

-- Ce qui change le verdict commun sans passer par une piece ou un revenu :
-- un dossier entre dans la colocation ou la quitte, est refuse ou echoit, ou
-- l'agence change de mode.
create function public.declenche_recalcul_colocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Un dossier ouvert hors colocation, ou dont la colocation ne change pas :
  -- rien a rejuger ici.
  if (tg_op = 'INSERT' and new.colocation_id is null)
     or (tg_op = 'UPDATE' and old.colocation_id is not distinct from new.colocation_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.colocation_id is not null then
    perform public.recalculer_colocation(old.colocation_id);
  end if;
  -- Le dossier lui-meme : avec sa nouvelle colocation, ou seul s'il en sort.
  perform public.recalculer_dossier(new.id);
  return new;
end;
$$;
revoke all on function public.declenche_recalcul_colocation()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger colocation_recalcule_le_dossier
after insert or update of colocation_id on public.dossiers
for each row execute function public.declenche_recalcul_colocation();

create function public.declenche_recalcul_depart() returns trigger
language plpgsql security definer set search_path='' as $$
declare la_colocation uuid := new.colocation_id;
begin
  if la_colocation is null and new.dossier_principal is not null then
    select p.colocation_id into la_colocation
      from public.dossiers p where p.id = new.dossier_principal;
  end if;
  if la_colocation is not null then
    perform public.recalculer_colocation(la_colocation);
  end if;
  return new;
end;
$$;
revoke all on function public.declenche_recalcul_depart()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
-- `recalculer_colocation` n'ecrit jamais ces deux statuts : pas de boucle.
create trigger depart_recalcule_la_colocation
after update on public.dossiers
for each row
when (new.statut in ('refuse', 'expire') and old.statut is distinct from new.statut)
execute function public.declenche_recalcul_depart();

-- L'agence change de mode tant qu'aucune decision n'a ete prise : un dossier
-- pris l'a ete sur le verdict d'alors.
create function public.regler_solvabilite_colocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.dossiers d
             where d.colocation_id = new.id and d.statut in ('transmis', 'signe')) then
    raise exception 'La solvabilite ne se regle plus : un dossier est deja pris.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.regler_solvabilite_colocation()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger solvabilite_reglable before update of solvabilite on public.colocations
for each row when (old.solvabilite is distinct from new.solvabilite)
execute function public.regler_solvabilite_colocation();

create function public.declenche_recalcul_solvabilite() returns trigger
language plpgsql security definer set search_path='' as $$
declare d record;
begin
  for d in select id from public.dossiers where colocation_id = new.id order by id loop
    perform public.recalculer_dossier(d.id);
  end loop;
  return new;
end;
$$;
revoke all on function public.declenche_recalcul_solvabilite()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger solvabilite_recalcule_les_dossiers after update of solvabilite on public.colocations
for each row when (old.solvabilite is distinct from new.solvabilite)
execute function public.declenche_recalcul_solvabilite();

-- Le ratio commun, pour la fiche de la colocation : la somme des revenus de
-- tous les garants sur le loyer total. Nul tant qu'un garant n'a pas declare
-- ses revenus. L'agence ne lit ici qu'un rapport, comme sur chaque dossier.
create function public.solvabilite_commune(la_colocation uuid) returns numeric
language sql stable security definer set search_path='' as $$
  select case when bool_and(e.revenu_net_mensuel_cents is not null)
           then least(trunc(sum(e.revenu_net_mensuel_cents)::numeric
                            / k.loyer_total_cents::numeric, 2), 999.99) end
    from public.colocations k
    join public.dossiers p on p.colocation_id = k.id
    join public.dossiers d on d.id = p.id or d.dossier_principal = p.id
    left join public.engagements e on e.dossier_id = d.id
   where k.id = la_colocation
     and k.agence_id = (select public.agence_courante())
     and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant',
                      'transmis', 'signe')
   group by k.id, k.loyer_total_cents;
$$;
revoke all on function public.solvabilite_commune(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.solvabilite_commune(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ce que le colocataire et son garant savent
-- ---------------------------------------------------------------------------

-- Deux colonnes de plus : combien de colocataires couvre le garant du
-- dossier, et si la solvabilite est jugee en commun. Toujours rien des autres
-- dossiers. Le nombre de colocataires compte ceux d'un garant commun.
drop function public.ma_colocation();
create function public.ma_colocation()
returns table(colocataires integer, loyer_total_cents bigint, etendue text,
              garantis integer, solvabilite text)
language sql stable security definer set search_path='' as $$
  select (select coalesce(sum(o.colocataires_garantis), 0)::int from public.dossiers o
           where o.colocation_id = c.id and o.expire_le > now()
             and o.statut not in ('refuse','expire')),
         c.loyer_total_cents, c.etendue,
         coalesce(p.colocataires_garantis, d.colocataires_garantis)::int, c.solvabilite
    from public.dossiers d
    left join public.dossiers p on p.id = d.dossier_principal
    join public.colocations c on c.id = coalesce(d.colocation_id, p.colocation_id)
   where d.id = public.dossier_courant()
     and public.partie_courante() in ('locataire','garant')
     and d.expire_le > now();
$$;
revoke all on function public.ma_colocation()
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.ma_colocation() to porteur_lien;
