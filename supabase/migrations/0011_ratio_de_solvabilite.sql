-- Le ratio de solvabilite : la premiere vraie logique metier.
--
-- Un ratio est une division, et il manquait les deux termes. Le loyer, que le
-- locataire connait ; le revenu net mensuel, que le garant declare. Les pieces
-- ne sont pas lues par une machine : elles sont la preuve que l'agence verifie
-- a l'oeil, le chiffre declare est ce qu'on divise.
--
-- Trois decisions, et la feuille de route exigeait que la premiere en soit une.
--
-- 1. Le seuil appartient a l'agence. Trois fois le loyer est la pratique la
--    plus repandue, certaines exigent davantage, quelques-unes moins. Une
--    colonne par agence, avec trois pour defaut, plutot qu'une constante dans
--    le code : c'est celui qui decide qui regle le curseur.
--
-- 2. Le calcul vit ici, en `security definer`. `porteur_lien` n'a le droit
--    d'ecrire ni `ratio` ni `statut`, et c'est voulu depuis la 0003 : le
--    passage a « complet » ou a « ce garant ne convient pas » ne peut venir
--    que d'un calcul, jamais d'une saisie. Un declencheur par ecriture qui
--    change le resultat, pour que la regle ne depende pas du chemin.
--
-- 3. Un dossier parti ne bouge plus. A partir de `transmis`, l'agence decide
--    sur ce qu'elle a vu ; recalculer derriere elle reecrirait l'histoire.

-- ---------------------------------------------------------------------------
-- 1. Les colonnes
-- ---------------------------------------------------------------------------

alter table public.agences
  add column seuil_ratio numeric(4, 2) not null default 3.00
      check (seuil_ratio between 1 and 10);

comment on column public.agences.seuil_ratio is
  'Revenu du garant exige, en multiples du loyer. Trois par defaut, regle par l administrateur.';

alter table public.dossiers
  add column loyer_cents bigint null check (loyer_cents is null or loyer_cents > 0);

comment on column public.dossiers.loyer_cents is
  'Le loyer mensuel, charges comprises, en centimes. Saisi par le locataire.';

alter table public.engagements
  add column revenu_net_mensuel_cents bigint null
      check (revenu_net_mensuel_cents is null or revenu_net_mensuel_cents > 0);

comment on column public.engagements.revenu_net_mensuel_cents is
  'Le revenu net mensuel declare par le garant, en centimes. Les pieces en sont la preuve.';

-- ---------------------------------------------------------------------------
-- 2. Les droits, colonne par colonne
-- ---------------------------------------------------------------------------
--
-- Les politiques existantes decident des lignes ; ces grants ajoutent une
-- colonne a ce que chacun peut y ecrire, et rien d'autre. `ratio` et `statut`
-- ne sont accordes a personne de plus qu'avant.

grant update (seuil_ratio) on public.agences to authenticated;
grant update (loyer_cents) on public.dossiers to porteur_lien, authenticated;
grant update (revenu_net_mensuel_cents) on public.engagements to porteur_lien;

-- ---------------------------------------------------------------------------
-- 2 bis. Le retrait d'une piece, jusqu'a la transmission
-- ---------------------------------------------------------------------------
--
-- Les politiques de 0003 et 0006 n'autorisaient le retrait qu'en `ouvert` et
-- `depot_en_cours`. Elles ont ete ecrites avant que `complet` et
-- `garant_insuffisant` existent comme etats automatiques, et reversibles : un
-- dossier complet n'est pas parti, le garant peut encore changer un bulletin.
-- Ce qui ferme le retrait, c'est `transmis`, quand l'agence decide dessus.
-- Meme regle sur la ligne et sur les octets, comme toujours.

drop policy "Le garant retire une piece avant transmission" on public.pieces;

create policy "Le garant retire une piece avant transmission"
  on public.pieces for delete to porteur_lien
  using (
    dossier_id = public.dossier_courant()
    and public.partie_courante() = 'garant'
    and exists (
      select 1 from public.dossiers d
       where d.id = dossier_id
         and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant')
    )
  );

drop policy "Le garant retire ses octets avant transmission" on storage.objects;

create policy "Le garant retire ses octets avant transmission"
  on storage.objects for delete to porteur_lien
  using (
    bucket_id = 'pieces'
    and public.partie_courante() = 'garant'
    and name like public.dossier_courant()::text || '/%'
    and exists (
      select 1 from public.dossiers d
       where d.id = public.dossier_courant()
         and d.statut in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Les pieces suffisent-elles
-- ---------------------------------------------------------------------------
--
-- Une de chaque : bulletins, avis d'imposition, identite, domicile. Le contrat
-- de travail est facultatif. On compte des natures, pas des fichiers : trois
-- bulletins peuvent tenir dans un seul PDF, et l'ecran le dit.

create function public.pieces_suffisantes(le_dossier uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct p.type) = 4
    from public.pieces p
   where p.dossier_id = le_dossier
     and p.type in ('bulletin_paie', 'avis_imposition', 'piece_identite', 'justificatif_domicile');
$$;

-- ---------------------------------------------------------------------------
-- 4. Le calcul
-- ---------------------------------------------------------------------------

create function public.recalculer_dossier(le_dossier uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  statut_actuel text;
  loyer         bigint;
  revenu        bigint;
  seuil         numeric(4, 2);
  nouveau_ratio numeric(5, 2);
  nouveau_statut text;
begin
  select d.statut, d.loyer_cents, coalesce(a.seuil_ratio, 3.00), e.revenu_net_mensuel_cents
    into statut_actuel, loyer, seuil, revenu
    from public.dossiers d
    left join public.agences a on a.id = d.agence_id
    left join public.engagements e on e.dossier_id = d.id
   where d.id = le_dossier;

  if not found then
    return;
  end if;

  -- Un dossier parti ne bouge plus.
  if statut_actuel not in ('ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant') then
    return;
  end if;

  if loyer is null or revenu is null then
    -- Il manque un terme : pas de ratio, et un verdict anterieur ne tient plus.
    update public.engagements
       set ratio = null, calcule_le = null
     where dossier_id = le_dossier and ratio is not null;

    if statut_actuel in ('complet', 'garant_insuffisant') then
      update public.dossiers set statut = 'depot_en_cours' where id = le_dossier;
    end if;

    return;
  end if;

  -- Tronque, jamais arrondi : 2,999 fois le loyer n'est pas trois fois le
  -- loyer, et un arrondi l'aurait fait passer. Le verdict se prend sur la
  -- valeur stockee, donc sur celle que l'agence lira : les deux ne peuvent pas
  -- se contredire. numeric(5, 2) plafonne a 999,99 ; au-dela, seul le verdict
  -- compte.
  nouveau_ratio := least(trunc(revenu::numeric / loyer::numeric, 2), 999.99);

  update public.engagements
     set ratio = nouveau_ratio, calcule_le = now()
   where dossier_id = le_dossier;

  if public.pieces_suffisantes(le_dossier) then
    nouveau_statut := case when nouveau_ratio >= seuil then 'complet' else 'garant_insuffisant' end;
  elsif statut_actuel in ('complet', 'garant_insuffisant') then
    -- Une piece retiree : le verdict tombe avec elle.
    nouveau_statut := 'depot_en_cours';
  else
    nouveau_statut := statut_actuel;
  end if;

  if nouveau_statut is distinct from statut_actuel then
    update public.dossiers set statut = nouveau_statut where id = le_dossier;
  end if;
end;
$$;

comment on function public.recalculer_dossier(uuid) is
  'Recalcule le ratio et le statut d un dossier encore ouvert. Appelee par les declencheurs, jamais par l API.';

revoke all on function public.pieces_suffisantes(uuid) from public;
revoke all on function public.recalculer_dossier(uuid) from public;

-- ---------------------------------------------------------------------------
-- 5. Les declencheurs : chaque ecriture qui change le resultat
-- ---------------------------------------------------------------------------

create function public.declenche_recalcul_engagement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculer_dossier(new.dossier_id);
  return new;
end;
$$;

create trigger engagement_recalcule_le_dossier
  after insert or update of revenu_net_mensuel_cents on public.engagements
  for each row
  execute function public.declenche_recalcul_engagement();

create function public.declenche_recalcul_loyer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculer_dossier(new.id);
  return new;
end;
$$;

-- `of loyer_cents` : le recalcul ecrit `statut`, et ce declencheur ne doit pas
-- se reveiller dessus.
create trigger loyer_recalcule_le_dossier
  after update of loyer_cents on public.dossiers
  for each row
  execute function public.declenche_recalcul_loyer();

create function public.declenche_recalcul_piece()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculer_dossier(coalesce(new.dossier_id, old.dossier_id));
  return coalesce(new, old);
end;
$$;

-- Nomme apres `piece_prolonge_le_dossier` dans l'ordre alphabetique : Postgres
-- execute les declencheurs d'un meme evenement dans cet ordre, et la
-- prolongation doit avoir pose `depot_en_cours` avant que le recalcul lise le
-- statut.
create trigger piece_recalcule_le_dossier
  after insert or delete on public.pieces
  for each row
  execute function public.declenche_recalcul_piece();

create function public.declenche_recalcul_seuil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d record;
begin
  -- Un seuil change, tous les dossiers encore ouverts de l'agence sont rejuges.
  -- Ceux qui sont partis ne bougent pas : `recalculer_dossier` le garantit.
  for d in select id from public.dossiers where agence_id = new.id loop
    perform public.recalculer_dossier(d.id);
  end loop;
  return new;
end;
$$;

create trigger seuil_recalcule_les_dossiers
  after update of seuil_ratio on public.agences
  for each row
  execute function public.declenche_recalcul_seuil();
