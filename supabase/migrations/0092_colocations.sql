-- La colocation : un groupe de dossiers, un par colocataire.
--
-- Plusieurs locataires signent le meme bail, chacun avec son ou ses garants.
-- Comme pour le second garant (0067), on ne multiplie rien a l'interieur d'un
-- dossier : chaque colocataire a le sien, avec ses pieces, sa cle, son
-- journal, ses liens et son acte. La colocation les relie, porte le loyer
-- total du bail et dit sur quoi chaque caution s'engage :
--   - `part` : le dossier porte la part de loyer de son colocataire ;
--   - `loyer_entier` : chaque dossier porte le loyer total, parce que le bail
--     est solidaire et que chaque caution en repond.
--
-- `recalculer_dossier` ne change pas : chaque colocataire est juge avec ses
-- garants sur le loyer que porte son dossier. Prendre, refuser et clore
-- restent des gestes par dossier, pour qu'un colocataire refuse puisse etre
-- remplace sans rouvrir les autres.
--
-- La colocation ne decrit que le bail : aucune donnee de candidat. Elle survit
-- donc a la purge des dossiers, qui s'en detachent en partant. Seule l'agence
-- la cree ; le paiement du locataire n'est pas concerne (un dossier ouvert par
-- l'agence en est dispense).

create table public.colocations (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  logement_id uuid null references public.logements(id) on delete set null,
  loyer_total_cents bigint not null check (loyer_total_cents > 0 and loyer_total_cents <= 10000000),
  etendue text not null default 'part' check (etendue in ('part', 'loyer_entier')),
  cree_le timestamptz not null default now()
);
create index colocations_agence_idx on public.colocations(agence_id, cree_le desc);
alter table public.colocations enable row level security;

comment on table public.colocations is
  'Bail partage par plusieurs colocataires. Loyer total et etendue de l''engagement, aucune donnee de candidat.';
comment on column public.colocations.etendue is
  'part : chaque dossier porte la part de son colocataire. loyer_entier : chaque dossier porte le loyer total.';

revoke all on public.colocations
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant select, delete on public.colocations to authenticated;
grant insert (agence_id, logement_id, loyer_total_cents, etendue) on public.colocations to authenticated;

create policy "Une agence lit ses colocations"
  on public.colocations for select to authenticated
  using (agence_id = (select public.agence_courante()));
create policy "Une agence cree ses colocations"
  on public.colocations for insert to authenticated
  with check (agence_id = (select public.agence_courante()));
create policy "Une agence supprime ses colocations"
  on public.colocations for delete to authenticated
  using (agence_id = (select public.agence_courante()));

-- Le logement d'une colocation est un logement de la meme agence.
create function public.verifier_logement_de_la_colocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.logement_id is not null and not exists(
    select 1 from public.logements l
     where l.id = new.logement_id and l.agence_id = new.agence_id) then
    raise exception 'Logement inconnu pour cette agence.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.verifier_logement_de_la_colocation()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger logement_de_la_colocation before insert or update of logement_id, agence_id
on public.colocations for each row execute function public.verifier_logement_de_la_colocation();

alter table public.dossiers
  add column colocation_id uuid null references public.colocations(id) on delete set null;
create index dossiers_colocation_idx on public.dossiers(colocation_id) where colocation_id is not null;
comment on column public.dossiers.colocation_id is
  'Colocation dont ce dossier est l''un des colocataires. Jamais sur le dossier d''un second garant.';

grant update (colocation_id) on public.dossiers to authenticated;

-- Ce qu'un dossier doit respecter pour entrer dans une colocation, et y
-- rester. La colocation est verrouillee le temps du controle : deux
-- ouvertures simultanees ne depassent pas le plafond a elles deux.
create function public.verifier_colocation_du_dossier() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.colocations; entre boolean;
begin
  if new.colocation_id is null then
    return new;
  end if;
  entre := tg_op = 'INSERT' or old.colocation_id is distinct from new.colocation_id;

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
    if (select count(*) from public.dossiers d
         where d.colocation_id = c.id and d.id <> new.id and d.expire_le > now()
           and d.statut not in ('refuse','expire')) >= 8 then
      raise exception 'Une colocation compte au plus huit colocataires.' using errcode='42501';
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

  if c.etendue = 'loyer_entier' then
    new.loyer_cents := c.loyer_total_cents;
  end if;
  return new;
end;
$$;
revoke all on function public.verifier_colocation_du_dossier()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger colocation_du_dossier
before insert or update of colocation_id, agence_id, dossier_principal, loyer_cents, demonstration
on public.dossiers for each row execute function public.verifier_colocation_du_dossier();

-- Le garant designe apres coup n'est pas un colocataire.
create function public.verifier_garant_de_colocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.colocation_id is not null and new.email_garant is not null
     and new.email_garant is distinct from old.email_garant
     and exists(select 1 from public.dossiers d
                 where d.colocation_id = new.colocation_id and d.id <> new.id
                   and d.expire_le > now() and d.statut not in ('refuse','expire')
                   and d.email_locataire = new.email_garant) then
    raise exception 'Un colocataire ne peut pas se porter garant d''un autre.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.verifier_garant_de_colocation()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger garant_de_colocation before update of email_garant
on public.dossiers for each row execute function public.verifier_garant_de_colocation();

-- Ce que le colocataire et son garant savent de la colocation : qu'elle
-- existe, combien de colocataires elle compte, le loyer total du bail et
-- l'etendue de l'engagement. Rien des autres dossiers. Le second garant lit
-- la colocation du dossier principal.
create function public.ma_colocation()
returns table(colocataires integer, loyer_total_cents bigint, etendue text)
language sql stable security definer set search_path='' as $$
  select (select count(*)::int from public.dossiers o
           where o.colocation_id = c.id and o.expire_le > now()
             and o.statut not in ('refuse','expire')),
         c.loyer_total_cents, c.etendue
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
