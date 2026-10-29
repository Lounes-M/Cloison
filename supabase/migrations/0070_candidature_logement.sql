-- Le lien de candidature d'un logement.
--
-- Une agence publie une annonce ; les candidats arrivent par courriel, par
-- telephone, et leur dossier Cloison doit ensuite etre rattache a la main, par
-- le domaine de l'agence. Un logement peut desormais porter un code de
-- candidature : le lien qui le contient presente le bien et l'agence, et un
-- dossier ouvert par ce lien, ou rattache avec ce code, rejoint directement
-- l'agence et le logement.
--
-- Le code n'ouvre rien d'autre que ce rattachement, et seulement avec
-- l'accord explicite du locataire, que l'application recueille. Il est
-- aleatoire (122 bits), revocable, et s'efface quand le logement est archive.
-- La page publique ne montre que le libelle choisi par l'agence, son loyer
-- de reference et le nom de l'agence : rien d'un candidat.

alter table public.logements
  add column code_candidature text null unique
  check (code_candidature ~ '^[a-f0-9]{32}$');
comment on column public.logements.code_candidature is
  'Code du lien de candidature, ou null si aucun lien n''est ouvert. Efface a l''archivage.';

-- Un logement archive ne recoit plus de candidats.
create function public.fermer_candidature_archivee() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.archive then new.code_candidature := null; end if;
  return new;
end;
$$;
revoke all on function public.fermer_candidature_archivee()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger candidature_archivee before insert or update of archive, code_candidature
on public.logements for each row execute function public.fermer_candidature_archivee();

-- Ouvrir (ou renouveler) le lien, ou le fermer. Renouveler revoque l'ancien.
create function public.regler_candidature_logement(le_logement uuid, ouvrir boolean)
returns text
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante(); code text;
begin
  if agence is null then
    raise exception 'Acces refuse.' using errcode='42501';
  end if;
  code := case when ouvrir then replace(gen_random_uuid()::text, '-', '') end;
  update public.logements set code_candidature = code
   where id = le_logement and agence_id = agence and (not ouvrir or not archive);
  if not found then
    raise exception 'Logement indisponible.' using errcode='42501';
  end if;
  return code;
end;
$$;
revoke all on function public.regler_candidature_logement(uuid, boolean)
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.regler_candidature_logement(uuid, boolean) to authenticated;

-- Ce que la page publique montre. Rien si le code est faux, le logement
-- archive ou l'agence non verifiee : la page dit alors seulement que le lien
-- ne fonctionne plus.
create function public.logement_par_code(le_code text)
returns table(libelle text, loyer_cents bigint, agence text)
language sql stable security definer set search_path='' as $$
  select l.libelle, l.loyer_cents, a.nom
    from public.logements l
    join public.agences a on a.id = l.agence_id
   where le_code ~ '^[a-f0-9]{32}$'
     and l.code_candidature = le_code
     and not l.archive
     and a.statut = 'verifiee';
$$;
revoke all on function public.logement_par_code(text)
 from public,anon,authenticated,porteur_lien,depot_piece,archive_signature,service_role;
grant execute on function public.logement_par_code(text) to serveur;

-- Le rattachement lui-meme, commun aux deux portes ci-dessous. Un dossier
-- deja rattache a une autre agence, ou a un autre logement, est refuse : on
-- ne deplace pas un dossier qu'une agence lit deja.
create function public.rattacher_au_logement_par_code(le_dossier uuid, le_code text)
returns text
language plpgsql security definer set search_path='' as $$
declare d public.dossiers; l public.logements; nom text;
begin
  select * into d from public.dossiers where id = le_dossier for update;
  select lo.* into l from public.logements lo
   where le_code ~ '^[a-f0-9]{32}$' and lo.code_candidature = le_code and not lo.archive;
  if l.id is null then
    raise exception 'Candidature indisponible.' using errcode='42501';
  end if;
  select a.nom into nom from public.agences a where a.id = l.agence_id and a.statut = 'verifiee';
  if nom is null
     or d.id is null
     or d.demonstration
     or d.dossier_principal is not null
     or d.expire_le <= now()
     or d.statut not in ('ouvert','depot_en_cours','complet','garant_insuffisant')
     or (d.agence_id is not null and d.agence_id <> l.agence_id)
     or (d.logement_id is not null and d.logement_id <> l.id) then
    raise exception 'Candidature indisponible.' using errcode='42501';
  end if;
  update public.dossiers set agence_id = l.agence_id, logement_id = l.id where id = d.id;
  perform public.recalculer_dossier(d.id);
  return nom;
end;
$$;
revoke all on function public.rattacher_au_logement_par_code(uuid, text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Le locataire, depuis son espace, avec le code de l'annonce.
create function public.candidater_au_logement(le_code text)
returns text
language plpgsql security definer set search_path='' as $$
begin
  if public.partie_courante() is distinct from 'locataire' then
    raise exception 'Acces refuse.' using errcode='42501';
  end if;
  return public.rattacher_au_logement_par_code(public.dossier_courant(), le_code);
end;
$$;
revoke all on function public.candidater_au_logement(text)
 from public,anon,authenticated,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.candidater_au_logement(text) to porteur_lien;

-- Le serveur, juste apres avoir ouvert un dossier depuis le lien : le
-- dossier vient d'etre cree et n'a encore aucune agence.
create function public.candidater_dossier_neuf(le_dossier uuid, le_code text)
returns text
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.dossiers d
                 where d.id = le_dossier and d.agence_id is null
                   and d.cree_le > now() - interval '15 minutes') then
    raise exception 'Candidature indisponible.' using errcode='42501';
  end if;
  return public.rattacher_au_logement_par_code(le_dossier, le_code);
end;
$$;
revoke all on function public.candidater_dossier_neuf(uuid, text)
 from public,anon,authenticated,porteur_lien,depot_piece,archive_signature,service_role;
grant execute on function public.candidater_dossier_neuf(uuid, text) to serveur;
