-- Importer les biens a louer depuis le logiciel de l'agence.
--
-- Jusqu'ici, l'agence ressaisissait chaque logement (0069, 0072). Elle peut
-- desormais indiquer son identifiant d'agence chez un editeur, et l'application
-- lit ses biens a louer pour creer ou mettre a jour ses logements.
--
-- Un seul editeur pour commencer : Apimo. L'identifiant n'est pas un secret :
-- l'acces a l'API de l'editeur repose sur les identifiants de prestataire de
-- Cloison, tenus cote serveur, et sur l'activation que l'agence demande a son
-- editeur. Rien n'est ecrit chez l'editeur.
--
-- Seuls des faits sur le bien entrent : libelle, loyer, ville, surface, pieces,
-- ameublement, disponibilite. Aucun contact, aucun proprietaire, aucun candidat.

create table public.connexions_logiciels (
  agence_id uuid not null references public.agences(id) on delete cascade,
  logiciel text not null check (logiciel in ('apimo')),
  identifiant text not null check (identifiant ~ '^[0-9]{1,10}$'),
  regle_par uuid null references auth.users(id) on delete set null,
  regle_le timestamptz not null default clock_timestamp(),
  demande_le timestamptz null,
  importe_le timestamptz null,
  primary key (agence_id, logiciel)
);
alter table public.connexions_logiciels enable row level security;
comment on table public.connexions_logiciels is
  'Identifiant de l''agence chez son editeur de logiciel, pour l''import des biens. Aucun secret.';

revoke all on public.connexions_logiciels
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant select (agence_id, logiciel, identifiant, regle_le, importe_le)
  on public.connexions_logiciels to authenticated;
create policy "Administrateur lit les connexions de son agence"
  on public.connexions_logiciels for select to authenticated
  using (
    agence_id = (select public.agence_courante())
    and exists(select 1 from public.membres_agence m
                where m.agence_id = connexions_logiciels.agence_id
                  and m.utilisateur_id = (select auth.uid()) and m.role = 'admin')
  );

-- D'ou vient un logement importe. Les logements saisis a la main gardent les
-- deux colonnes vides. L'agence ne les ecrit pas elle-meme : seule la fonction
-- d'import le fait.
alter table public.logements
  add column source text null check (source in ('apimo')),
  add column reference_externe text null check (reference_externe ~ '^[A-Za-z0-9._-]{1,64}$'),
  add constraint logements_source_complete check ((source is null) = (reference_externe is null));
create unique index logements_source_idx
  on public.logements(agence_id, source, reference_externe) where source is not null;
comment on column public.logements.reference_externe is
  'Identifiant du bien chez l''editeur d''origine. Vide pour un logement saisi a la main.';

-- Enregistrer, changer ou retirer l'identifiant. Reserve a l'administrateur.
-- Un identifiant vide retire la connexion ; les logements deja importes restent.
create function public.regler_connexion_logiciel(le_logiciel text, l_identifiant text)
returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
begin
  if agence is null or le_logiciel is distinct from 'apimo'
     or not exists(select 1 from public.membres_agence
                    where agence_id = agence and utilisateur_id = auth.uid() and role = 'admin') then
    return false;
  end if;
  if l_identifiant is null or l_identifiant = '' then
    delete from public.connexions_logiciels where agence_id = agence and logiciel = le_logiciel;
    return true;
  end if;
  if l_identifiant !~ '^[0-9]{1,10}$' then
    return false;
  end if;
  insert into public.connexions_logiciels(agence_id, logiciel, identifiant, regle_par)
  values (agence, le_logiciel, l_identifiant, auth.uid())
  on conflict (agence_id, logiciel) do update
    set identifiant = excluded.identifiant, regle_par = excluded.regle_par,
        regle_le = clock_timestamp(),
        importe_le = case when connexions_logiciels.identifiant = excluded.identifiant
                          then connexions_logiciels.importe_le end;
  return true;
end;
$$;

-- Reserver un import : rend l'identifiant a interroger, ou rien. Un import par
-- minute et par agence, pour ne pas solliciter l'editeur en boucle.
create function public.reserver_import_logiciel(le_logiciel text)
returns text
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante(); c public.connexions_logiciels;
begin
  if agence is null
     or not exists(select 1 from public.membres_agence
                    where agence_id = agence and utilisateur_id = auth.uid() and role = 'admin') then
    return null;
  end if;
  select * into c from public.connexions_logiciels
   where agence_id = agence and logiciel = le_logiciel for update;
  if c.agence_id is null
     or (c.demande_le is not null and c.demande_le > clock_timestamp() - interval '1 minute') then
    return null;
  end if;
  update public.connexions_logiciels set demande_le = clock_timestamp()
   where agence_id = agence and logiciel = le_logiciel;
  return c.identifiant;
end;
$$;

-- Inscrire les biens lus chez l'editeur. Un bien deja importe est mis a jour,
-- jamais duplique ; une valeur absente chez l'editeur n'efface pas celle que
-- l'agence a saisie ; un logement archive le reste. Tout ou rien : une valeur
-- hors bornes annule l'import entier.
create function public.importer_logements(le_logiciel text, biens jsonb)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  agence uuid := public.agence_courante();
  b jsonb; trouve uuid; crees integer := 0; mis_a_jour integer := 0;
begin
  if agence is null or biens is null or jsonb_typeof(biens) <> 'array'
     or jsonb_array_length(biens) > 200
     or not exists(select 1 from public.membres_agence
                    where agence_id = agence and utilisateur_id = auth.uid() and role = 'admin')
     or not exists(select 1 from public.connexions_logiciels
                    where agence_id = agence and logiciel = le_logiciel) then
    return null;
  end if;
  perform 1 from public.connexions_logiciels
   where agence_id = agence and logiciel = le_logiciel for update;
  for b in select * from jsonb_array_elements(biens) loop
    select l.id into trouve from public.logements l
     where l.agence_id = agence and l.source = le_logiciel
       and l.reference_externe = b->>'reference';
    if trouve is null then
      insert into public.logements(agence_id, source, reference_externe, libelle, loyer_cents,
                                   ville, surface_m2, pieces, meuble, disponible_le)
      values (agence, le_logiciel, b->>'reference', btrim(b->>'libelle'),
              (b->>'loyer_cents')::bigint, b->>'ville', (b->>'surface_m2')::integer,
              (b->>'pieces')::smallint, (b->>'meuble')::boolean, (b->>'disponible_le')::date);
      crees := crees + 1;
    else
      update public.logements l set
        libelle = btrim(b->>'libelle'),
        loyer_cents = coalesce((b->>'loyer_cents')::bigint, l.loyer_cents),
        ville = coalesce(b->>'ville', l.ville),
        surface_m2 = coalesce((b->>'surface_m2')::integer, l.surface_m2),
        pieces = coalesce((b->>'pieces')::smallint, l.pieces),
        meuble = coalesce((b->>'meuble')::boolean, l.meuble),
        disponible_le = coalesce((b->>'disponible_le')::date, l.disponible_le)
      where l.id = trouve;
      mis_a_jour := mis_a_jour + 1;
    end if;
  end loop;
  update public.connexions_logiciels set importe_le = clock_timestamp()
   where agence_id = agence and logiciel = le_logiciel;
  return jsonb_build_object('crees', crees, 'mis_a_jour', mis_a_jour);
end;
$$;

revoke all on function public.regler_connexion_logiciel(text, text),
  public.reserver_import_logiciel(text), public.importer_logements(text, jsonb)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.regler_connexion_logiciel(text, text),
  public.reserver_import_logiciel(text), public.importer_logements(text, jsonb)
  to authenticated;
