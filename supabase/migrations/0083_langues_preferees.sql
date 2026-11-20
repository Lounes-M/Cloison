-- La langue preferee de chaque personne.
--
-- Le site existe en francais et en anglais. La langue d'affichage suit un
-- cookie ; celle des courriels doit survivre au navigateur, donc elle vit ici.
-- Un locataire et un garant n'ont pas de compte : leur langue est rangee par
-- dossier et par partie. Un collaborateur d'agence a la sienne, supprimee avec
-- son appartenance.
--
-- Les deux tables sont fermees. Le serveur regle et lit la langue d'un porteur
-- apres avoir verifie son jeton ; un collaborateur regle la sienne. Sans ligne,
-- la langue est le francais : aucune donnee existante n'est a reprendre.

create table public.langues_dossiers (
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 partie text not null check (partie in ('locataire','garant')),
 langue text not null check (langue in ('fr','en')),
 primary key (dossier_id, partie)
);
alter table public.langues_dossiers enable row level security;
revoke all on public.langues_dossiers
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

create table public.langues_membres (
 utilisateur_id uuid primary key references public.membres_agence(utilisateur_id) on delete cascade,
 langue text not null check (langue in ('fr','en'))
);
alter table public.langues_membres enable row level security;
revoke all on public.langues_membres
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Le serveur a deja verifie le jeton du porteur, ou vient d'ouvrir le dossier.
create function public.regler_langue_dossier(le_dossier uuid, la_partie text, la_langue text)
returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if le_dossier is null or la_partie is null or la_langue is null
  or la_partie not in ('locataire','garant') or la_langue not in ('fr','en') then
  return false;
 end if;
 perform 1 from public.dossiers
  where id = le_dossier and expire_le > clock_timestamp() and statut <> 'expire';
 if not found then return false; end if;
 insert into public.langues_dossiers(dossier_id, partie, langue)
  values (le_dossier, la_partie, la_langue)
  on conflict (dossier_id, partie) do update set langue = excluded.langue;
 return true;
end;
$$;

-- Rien tant que la personne n'a rien choisi : l'appelant decide du repli.
create function public.langue_dossier(le_dossier uuid, la_partie text)
returns text
language sql stable security definer set search_path='' as $$
 select l.langue from public.langues_dossiers l
  where l.dossier_id = le_dossier and l.partie = la_partie;
$$;

create function public.regler_ma_langue(la_langue text)
returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or la_langue is null or la_langue not in ('fr','en') then
  return false;
 end if;
 perform 1 from public.membres_agence
  where utilisateur_id = auth.uid() and agence_id = public.agence_courante();
 if not found then return false; end if;
 insert into public.langues_membres(utilisateur_id, langue) values (auth.uid(), la_langue)
  on conflict (utilisateur_id) do update set langue = excluded.langue;
 return true;
end;
$$;

create function public.ma_langue()
returns text
language sql stable security definer set search_path='' as $$
 select l.langue from public.langues_membres l
  join public.membres_agence m on m.utilisateur_id = l.utilisateur_id
  where l.utilisateur_id = auth.uid() and m.agence_id = public.agence_courante();
$$;

-- La langue de chaque destinataire d'un courriel. Les fonctions qui preparent
-- les envois ne changent pas : le serveur pose cette question a cote, avec le
-- dossier et les adresses qu'il tient deja. Une adresse inconnue recoit le
-- francais, donc la reponse ne dit pas si elle existe.
create function public.langues_courriels(le_dossier uuid, adresses text[])
returns table(adresse text, langue text)
language sql stable security definer set search_path='' as $$
 select a.adresse,
  coalesce(
   (select l.langue from public.dossiers d
     join public.langues_dossiers l on l.dossier_id = d.id
     where d.id = le_dossier
      and ((l.partie = 'locataire' and lower(d.email_locataire) = lower(a.adresse))
        or (l.partie = 'garant' and lower(d.email_garant) = lower(a.adresse)))
     order by l.partie desc limit 1),
   (select l.langue from auth.users u
     join public.langues_membres l on l.utilisateur_id = u.id
     where lower(u.email) = lower(a.adresse) limit 1),
   'fr')
 from unnest(coalesce(adresses[1:50], '{}'::text[])) as a(adresse);
$$;

revoke all on function public.regler_langue_dossier(uuid,text,text), public.langue_dossier(uuid,text),
 public.regler_ma_langue(text), public.ma_langue(), public.langues_courriels(uuid,text[])
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.regler_langue_dossier(uuid,text,text), public.langue_dossier(uuid,text),
 public.langues_courriels(uuid,text[]) to serveur;
grant execute on function public.regler_ma_langue(text), public.ma_langue() to authenticated;
notify pgrst,'reload schema';
