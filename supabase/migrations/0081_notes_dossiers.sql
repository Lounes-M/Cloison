-- Notes internes de l'agence sur un dossier.
--
-- Un appel au garant, un document promis par telephone, une consigne pour un
-- collegue : rien de cela n'avait de place dans Cloison, et chacun le notait
-- ailleurs. Ces notes restent entre collaborateurs de l'agence : ni le
-- locataire ni le garant ne les voient, aucune piece n'y est jointe, et elles
-- disparaissent avec le dossier (cascade a la purge, effacement explicite
-- quand le coffre d'un dossier signe est purge).
--
-- La table est fermee ; tout passe par trois fonctions qui verifient l'agence
-- courante et l'echeance du dossier. Une note se supprime par son auteur ou
-- par un administrateur ; elle ne se modifie pas.

create table public.notes_dossiers (
 id uuid primary key default gen_random_uuid(),
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 auteur_id uuid not null,
 texte text not null check (char_length(texte) between 1 and 1000 and texte = btrim(texte)),
 cree_le timestamptz not null default clock_timestamp()
);
create index notes_dossiers_page on public.notes_dossiers(dossier_id, cree_le desc, id desc);
alter table public.notes_dossiers enable row level security;
revoke all on public.notes_dossiers
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

create function public.notes_du_dossier(le_dossier uuid)
returns table(id uuid, texte text, cree_le timestamptz, auteur_email text, supprimable boolean)
language sql stable security definer set search_path='' as $$
 select n.id, n.texte, n.cree_le,
  case when u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine then u.email::text end,
  n.auteur_id = auth.uid() or public.est_admin_agence()
 from public.notes_dossiers n
 join public.dossiers d on d.id = n.dossier_id
 join public.agences a on a.id = d.agence_id
 left join public.membres_agence m on m.utilisateur_id = n.auteur_id and m.agence_id = d.agence_id
 left join auth.users u on u.id = m.utilisateur_id
 where d.id = le_dossier and d.agence_id = public.agence_courante()
   and d.expire_le > clock_timestamp() and d.statut <> 'expire'
 order by n.cree_le desc, n.id desc
 limit 100;
$$;

create function public.ajouter_note_dossier(le_dossier uuid, le_texte text)
returns uuid
language plpgsql security definer set search_path='' as $$
declare
 agence uuid := public.agence_courante();
 propre text := btrim(coalesce(le_texte, ''));
 nouvelle uuid;
begin
 if agence is null or auth.uid() is null or le_dossier is null
  or char_length(propre) not between 1 and 1000 then
  return null;
 end if;
 perform 1 from public.dossiers
  where id = le_dossier and agence_id = agence and expire_le > clock_timestamp() and statut <> 'expire'
  for update;
 if not found then return null; end if;
 -- Un plafond large, contre l'usage du dossier comme messagerie.
 if (select count(*) from public.notes_dossiers where dossier_id = le_dossier) >= 200 then
  return null;
 end if;
 insert into public.notes_dossiers(dossier_id, auteur_id, texte)
  values (le_dossier, auth.uid(), propre) returning id into nouvelle;
 return nouvelle;
end;
$$;

create function public.supprimer_note_dossier(la_note uuid)
returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
begin
 if agence is null or auth.uid() is null or la_note is null then return false; end if;
 delete from public.notes_dossiers n
  using public.dossiers d
  where n.id = la_note and d.id = n.dossier_id and d.agence_id = agence
    and d.expire_le > clock_timestamp()
    and (n.auteur_id = auth.uid() or public.est_admin_agence());
 return found;
end;
$$;

-- Un dossier signe garde sa ligne apres la purge du coffre : ses notes, elles,
-- partent avec le coffre.
create function public.effacer_notes_coffre_purge() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.coffre_purge_le is null and new.coffre_purge_le is not null then
  delete from public.notes_dossiers where dossier_id = new.id;
 end if;
 return new;
end;
$$;
create trigger effacer_notes_coffre_purge after update of coffre_purge_le on public.dossiers
 for each row execute function public.effacer_notes_coffre_purge();

revoke all on function public.notes_du_dossier(uuid), public.ajouter_note_dossier(uuid,text),
 public.supprimer_note_dossier(uuid), public.effacer_notes_coffre_purge()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.notes_du_dossier(uuid), public.ajouter_note_dossier(uuid,text),
 public.supprimer_note_dossier(uuid) to authenticated;
notify pgrst,'reload schema';
