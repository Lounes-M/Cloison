-- Suites de l'audit fonctionnel du 22 novembre 2026.
--
-- 1. Le locataire et le garant sont prevenus sept jours avant l'echeance de
--    leur dossier. Jusqu'ici seuls les collaborateurs d'une agence pouvaient
--    l'etre, si l'agence avait active le rappel (0052) : un dossier sans
--    agence, ou transmis en attente de signature, pouvait etre purge sans que
--    personne ne l'ait vu venir. L'annonce ne depend d'aucun reglage d'agence,
--    part une seule fois par echeance et ne prolonge rien.
-- 2. Une notification Docage rejouee n'ajoute plus de ligne au registre.
--    Docage ne donne aucun identifiant d'evenement : la route en tirait un au
--    hasard a chaque appel. L'identifiant derive maintenant de la transaction
--    et de son etat, et un rejeu ne fait que reveiller la lecture.

create table public.alertes_echeance (
 dossier_id uuid primary key references public.dossiers(id) on delete cascade,
 expiration timestamptz not null,
 cree_le timestamptz not null default clock_timestamp()
);
alter table public.alertes_echeance enable row level security;
revoke all on public.alertes_echeance
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

-- Les dossiers dont l'echeance approche et que personne n'a encore annonces.
-- `secondaire` : le dossier d'un second garant (0067), dont le locataire est
-- deja prevenu par le dossier principal.
create function public.echeances_a_annoncer()
returns table(dossier_id uuid,reference text,email_locataire text,email_garant text,expiration timestamptz,secondaire boolean)
language sql stable security definer set search_path='' as $$
 select d.id,d.reference,d.email_locataire::text,d.email_garant::text,d.expire_le,d.dossier_principal is not null
 from public.dossiers d
 where not d.demonstration
  and d.expire_le>clock_timestamp()
  and d.expire_le<=clock_timestamp()+interval '7 days'
  and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant','transmis')
  and not exists(select 1 from public.alertes_echeance a where a.dossier_id=d.id and a.expiration=d.expire_le)
 order by d.expire_le,d.id limit 20;
$$;

-- Acquitte l'annonce une fois ses courriels en file. L'echeance attendue
-- protege d'un dossier prolonge entre la lecture et l'acquittement (un
-- paiement repousse l'echeance) : il sera annonce a sa nouvelle date.
create function public.acquitter_alerte_echeance(le_dossier uuid,l_expiration timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into public.alertes_echeance(dossier_id,expiration)
 select d.id,d.expire_le from public.dossiers d where d.id=le_dossier and d.expire_le=l_expiration
 on conflict(dossier_id) do update set expiration=excluded.expiration,cree_le=clock_timestamp();
 return found;
end;$$;

revoke all on function public.echeances_a_annoncer(),public.acquitter_alerte_echeance(uuid,timestamptz)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.echeances_a_annoncer(),public.acquitter_alerte_echeance(uuid,timestamptz) to serveur;

-- Reveil Docage : un identifiant stable par transaction et par etat. Comme
-- pour `enregistrer_evenement_signature`, l'evenement ne change jamais l'etat
-- du dossier ; il avance seulement la prochaine lecture authentifiee.
create function public.enregistrer_reveil_docage(le_mode text,la_reference uuid,le_statut text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if le_mode is null or le_mode not in ('sandbox','production') or la_reference is null or le_statut is null
  or le_statut not in ('draft','approval','ongoing','paused','rejected','declined','canceled','expired','deleted','done') then
  raise exception 'Notification signature invalide';
 end if;
 insert into public.evenements_signature(environnement,id,reference_fournisseur,etat,survenu_le)
 values(le_mode,pg_catalog.md5('docage/'||la_reference::text||'/'||le_statut)::uuid,la_reference,le_statut,clock_timestamp())
 on conflict(environnement,id) do nothing;
 update public.demandes_signature set revision=revision+1,prochaine_lecture=clock_timestamp()
 where environnement=le_mode and reference_fournisseur=la_reference;
 return jsonb_build_object('enregistre',true,'anomalie',false);
end;$$;
revoke all on function public.enregistrer_reveil_docage(text,uuid,text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.enregistrer_reveil_docage(text,uuid,text) to serveur;

notify pgrst,'reload schema';
