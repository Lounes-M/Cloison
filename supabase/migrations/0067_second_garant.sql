-- Un second garant, par un second dossier lie au premier.
--
-- Deux parents qui se portent caution ensemble, c'est deux actes de
-- cautionnement, deux declarations, deux jeux de pieces. Le modele le dit
-- deja dossier par dossier : un garant, ses pieces, sa cle, son journal, ses
-- liens. Plutot que de multiplier les garants a l'interieur d'un dossier, ce
-- qui toucherait chaque table et chaque politique, le second garant recoit son
-- propre dossier, lie au premier par `dossier_principal`. Le cloisonnement
-- entre les deux garants est donc celui qui existe deja entre deux dossiers.
--
-- Ce qui change :
--   - le ratio individuel reste stocke par dossier, mais le verdict (complet
--     ou garant insuffisant) se prend sur la somme des revenus du groupe,
--     quand chaque garant a tout depose ; les deux dossiers portent le meme ;
--   - le loyer du dossier principal se recopie sur le second ;
--   - prendre ou refuser l'un prend ou refuse l'autre, clore l'un clot
--     l'autre ;
--   - le locataire et l'agence ne recoivent les courriels de statut qu'au
--     titre du dossier principal ; le second garant recoit les siens ;
--   - aucun lien de locataire n'existe sur un dossier second.

alter table public.dossiers
  add column dossier_principal uuid null references public.dossiers(id) on delete set null;
create unique index un_seul_second_garant on public.dossiers(dossier_principal)
  where dossier_principal is not null;

comment on column public.dossiers.dossier_principal is
  'Dossier du premier garant, pour le dossier du second. Nul pour un dossier principal.';

-- Les membres ouverts d'un groupe : le principal et son eventuel second.
create function public.racine_du_dossier(le_dossier uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select coalesce(d.dossier_principal, d.id) from public.dossiers d where d.id=le_dossier;
$$;
revoke all on function public.racine_du_dossier(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Meme regles que la 0011, appliquees au groupe. Pour un dossier sans second
-- garant, le resultat est exactement celui d'avant.
create or replace function public.recalculer_dossier(le_dossier uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  racine uuid;
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
revoke all on function public.recalculer_dossier(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece;

-- Le loyer est celui du locataire : il se saisit sur le principal et se
-- recopie. Le verrou de la 0020 s'applique a chaque dossier, si bien qu'un
-- loyer fige par la declaration du second garant fige aussi le principal.
create function public.recopier_loyer_au_second() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Sur le second, le loyer ne s'ecrit que par recopie : il vaut toujours
  -- celui du principal.
  if new.dossier_principal is not null and new.loyer_cents is distinct from old.loyer_cents
    and new.loyer_cents is distinct from (
      select p.loyer_cents from public.dossiers p where p.id = new.dossier_principal) then
    raise exception 'Le loyer se saisit sur le dossier principal.' using errcode='42501';
  end if;
  if new.dossier_principal is null and new.loyer_cents is distinct from old.loyer_cents then
    update public.dossiers set loyer_cents = new.loyer_cents
     where dossier_principal = new.id and loyer_cents is distinct from new.loyer_cents;
  end if;
  return new;
end;
$$;
revoke all on function public.recopier_loyer_au_second()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger loyer_recopie_au_second after update of loyer_cents on public.dossiers
for each row execute function public.recopier_loyer_au_second();

-- La decision de l'agence porte sur le groupe : les deux garants ont ete
-- juges ensemble, ils sont pris ou refuses ensemble.
create function public.propager_decision_groupe() returns trigger
language plpgsql security definer set search_path='' as $$
declare racine uuid := coalesce(new.dossier_principal, new.id);
begin
  if new.statut = 'transmis' and old.statut = 'complet' then
    update public.dossiers set statut = 'transmis'
     where (id = racine or dossier_principal = racine) and id <> new.id and statut = 'complet';
  elsif new.statut = 'refuse' and old.statut is distinct from 'refuse' then
    update public.dossiers set statut = 'refuse'
     where (id = racine or dossier_principal = racine) and id <> new.id
       and statut in ('complet', 'garant_insuffisant', 'transmis');
  end if;
  return new;
end;
$$;
revoke all on function public.propager_decision_groupe()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger decision_du_groupe after update of statut on public.dossiers
for each row execute function public.propager_decision_groupe();

-- Le locataire n'a de lien que sur le dossier principal.
create function public.refuser_locataire_sur_second() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.partie = 'locataire' and exists(
    select 1 from public.dossiers d where d.id = new.dossier_id and d.dossier_principal is not null) then
    raise exception 'Aucun lien de locataire sur le dossier d''un second garant.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.refuser_locataire_sur_second()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger pas_de_locataire_sur_second before insert or update on public.jetons_actifs
for each row execute function public.refuser_locataire_sur_second();

create or replace function public.retrouver_lien_locataire(courriel text, reference_dossier text)
returns table(dossier_id uuid, reference text, jti uuid, expire_le timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.dossiers;
begin
  select * into d from public.dossiers where email_locataire=lower(trim(courriel))
    and dossiers.reference=trim(reference_dossier) and dossiers.expire_le>now()
    and dossiers.dossier_principal is null for update;
  if not found then return; end if;
  return query select d.id,d.reference,j.jti,j.expire_le
    from public.emettre_jeton(d.id,'locataire','7 days') j;
end $$;
revoke all on function public.retrouver_lien_locataire(text,text) from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.retrouver_lien_locataire(text,text) to serveur;

-- Le locataire designe le second garant depuis son dossier, ou lui renvoie
-- son lien. Memes regles que le premier garant (0020), plus celles du
-- groupe : dossier d'agence, premier garant deja designe, dossier ouvert.
create function public.designer_second_garant(courriel text)
returns table(dossier uuid, jti uuid, expire_le timestamptz)
language plpgsql security definer set search_path='' as $$
declare p public.dossiers; s public.dossiers; adresse text := lower(trim(courriel));
begin
  if public.partie_courante() is distinct from 'locataire' then
    raise exception 'Acces refuse.' using errcode='42501';
  end if;
  select * into p from public.dossiers where id=public.dossier_courant() for update;
  if not found or p.dossier_principal is not null or p.agence_id is null or p.demonstration
    or p.email_garant is null or p.expire_le<=now()
    or p.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant')
    or courriel is null or length(courriel)>180
    or adresse !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or adresse=p.email_locataire or adresse=p.email_garant then
    raise exception 'Designation refusee.' using errcode='42501';
  end if;
  select * into s from public.dossiers where dossier_principal=p.id for update;
  if not found then
    insert into public.dossiers(agence_id,email_locataire,email_garant,loyer_cents,locataire_nom,
      expire_le,dossier_principal)
    values(p.agence_id,p.email_locataire,adresse,p.loyer_cents,p.locataire_nom,p.expire_le,p.id)
    returning * into s;
  elsif s.expire_le<=now() or s.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant') then
    raise exception 'Designation refusee.' using errcode='42501';
  elsif s.email_garant is distinct from adresse then
    -- Le declencheur de la 0020 refuse le remplacement d'un garant deja invite.
    update public.dossiers set email_garant=adresse where id=s.id;
  end if;
  -- Un nouveau membre rejuge le groupe : le principal ne peut plus etre
  -- complet tant que le second n'a pas depose.
  perform public.recalculer_dossier(p.id);
  return query select s.id,e.jti,e.expire_le from public.emettre_jeton(s.id,'garant','7 days') e;
end;
$$;
revoke all on function public.designer_second_garant(text)
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.designer_second_garant(text) to porteur_lien;

-- Ce que le locataire sait du second garant : son adresse et rien d'autre.
create function public.mon_second_garant() returns text
language sql stable security definer set search_path='' as $$
  select s.email_garant from public.dossiers s
   where public.partie_courante()='locataire'
     and s.dossier_principal=public.dossier_courant() and s.expire_le>now();
$$;
revoke all on function public.mon_second_garant()
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.mon_second_garant() to porteur_lien;

-- L'agence lit le groupe d'un de ses dossiers : l'autre dossier et la
-- solvabilite des deux garants ensemble, une fois les deux revenus declares.
create function public.groupe_du_dossier(le_dossier uuid)
returns table(autre uuid, autre_reference text, autre_principal boolean, ratio_groupe numeric)
language plpgsql stable security definer set search_path='' as $$
declare moi public.dossiers; racine uuid; total bigint; n integer;
begin
  select * into moi from public.dossiers d
   where d.id=le_dossier and d.agence_id=public.agence_courante() and d.expire_le>now();
  if not found then return; end if;
  racine := coalesce(moi.dossier_principal, moi.id);
  select sum(e.revenu_net_mensuel_cents), count(e.revenu_net_mensuel_cents) into total, n
    from public.dossiers g join public.engagements e on e.dossier_id=g.id
   where (g.id=racine or g.dossier_principal=racine) and g.expire_le>now();
  return query select o.id, o.reference, o.dossier_principal is null,
    case when n=2 and moi.loyer_cents is not null
      then least(trunc(total::numeric/moi.loyer_cents::numeric, 2), 999.99) end
    from public.dossiers o
   where (o.id=racine or o.dossier_principal=racine) and o.id<>moi.id
     and o.agence_id=moi.agence_id and o.expire_le>now();
end;
$$;
revoke all on function public.groupe_du_dossier(uuid)
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.groupe_du_dossier(uuid) to authenticated;

-- Clore l'un clot l'autre : meme garde-fous que la 0066, appliques au dossier
-- designe, puis le groupe entier se ferme dans la meme transaction.
create or replace function public.clore_dossier(le_dossier uuid, la_reference text)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 agence uuid:=public.agence_courante();
 d public.dossiers;
 racine uuid;
 second text;
begin
 if agence is null or le_dossier is null or la_reference is null then return null;end if;
 select * into d from public.dossiers
  where id=le_dossier and agence_id=agence and expire_le>clock_timestamp()
  for update;
 if not found or d.demonstration or d.reference<>la_reference
  or d.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant','refuse') then
  return null;
 end if;
 if not public.est_admin_agence() and not exists(
  select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=auth.uid()) then
  return null;
 end if;
 racine:=coalesce(d.dossier_principal,d.id);
 select g.email_garant into second from public.dossiers g
  where g.dossier_principal=racine and g.agence_id=agence and g.expire_le>clock_timestamp()
   and g.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','refuse');
 if d.dossier_principal is not null then
  -- Le dossier designe est le second : le principal porte le premier garant.
  select g.email_garant into second from public.dossiers g where g.id=d.id;
  select * into d from public.dossiers g where g.id=racine and g.agence_id=agence;
 end if;
 -- `now()` et non l'horloge : la politique de la 0033 et la purge comparent a
 -- `now()`, qui doit voir le dossier echu des cette transaction.
 update public.dossiers g set statut='expire',expire_le=greatest(now()-interval '1 millisecond',g.cree_le+interval '1 millisecond')
  where (g.id=racine or g.dossier_principal=racine) and g.agence_id=agence and g.expire_le>clock_timestamp()
   and g.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','refuse');
 delete from public.jetons_actifs j using public.dossiers g
  where j.dossier_id=g.id and (g.id=racine or g.dossier_principal=racine) and g.statut='expire';
 delete from public.cles_dossier c using public.dossiers g
  where c.dossier_id=g.id and (g.id=racine or g.dossier_principal=racine) and g.statut='expire';
 delete from public.notifications_statut n using public.dossiers g
  where n.dossier_id=g.id and (g.id=racine or g.dossier_principal=racine) and g.statut='expire';
 return jsonb_build_object('reference',d.reference,'email_locataire',d.email_locataire,
  'email_garant',d.email_garant,'email_second_garant',second);
end;
$$;
revoke all on function public.clore_dossier(uuid,text)
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.clore_dossier(uuid,text) to authenticated;

-- Le second dossier ne double pas les courriels du locataire et de l'agence.
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
      'demonstration',d.demonstration,
      'secondaire',d.dossier_principal is not null),
    array(select u.email from public.membres_agence m
      join auth.users u on u.id=m.utilisateur_id
      join public.agences a on a.id=m.agence_id
      left join public.preferences_notifications p on p.utilisateur_id=m.utilisateur_id
      where a.id=d.agence_id and a.statut='verifiee'
      and u.email_confirmed_at is not null
      and split_part(lower(u.email),'@',2)=lower(a.domaine)
      and (coalesce(p.mode,'tous')='tous' or (p.mode='mes' and exists(
        select 1 from public.affectations_dossiers f where f.dossier_id=d.id and f.membre_id=m.utilisateur_id))))
  from public.notifications_statut n join public.dossiers d on d.id=n.dossier_id
  where d.expire_le > now() and (le_dossier is null or n.dossier_id=le_dossier)
  order by n.cree_le,n.id limit 20;
$$;
revoke all on function public.notifications_a_livrer(uuid) from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.notifications_a_livrer(uuid) to serveur;
