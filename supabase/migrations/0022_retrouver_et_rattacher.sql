create function public.retrouver_lien_locataire(courriel text, reference_dossier text)
returns table(dossier_id uuid, reference text, jti uuid, expire_le timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.dossiers;
begin
  select * into d from public.dossiers where email_locataire=lower(trim(courriel))
    and dossiers.reference=trim(reference_dossier) and dossiers.expire_le>now() for update;
  if not found then return; end if;
  return query select d.id,d.reference,j.jti,j.expire_le
    from public.emettre_jeton(d.id,'locataire','7 days') j;
end $$;
revoke all on function public.retrouver_lien_locataire(text,text) from public;
grant execute on function public.retrouver_lien_locataire(text,text) to serveur;

create function public.rattacher_mon_dossier(domaine_agence text)
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
  update public.dossiers set agence_id=a.id where id=d.id;
  perform public.recalculer_dossier(d.id);
  return a.nom;
end $$;
revoke all on function public.rattacher_mon_dossier(text) from public;
grant execute on function public.rattacher_mon_dossier(text) to porteur_lien;

-- Un paiement confirme et concurrent ne peut pas ecraser un autre paiement.
create or replace function public.marquer_dossier_paye(le_dossier uuid, la_reference text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare deja text;
begin
  select paiement_ref into deja from public.dossiers where id=le_dossier for update;
  if not found then return false; end if;
  if deja is not null then
    if deja=la_reference then return true; end if;
    raise exception 'Dossier deja regle avec un paiement different.' using errcode='23505';
  end if;
  update public.dossiers set paye_le=now(),paiement_ref=la_reference,
    expire_le=greatest(expire_le,now()+interval '3 months') where id=le_dossier;
  return true;
end $$;
