-- Prevenir l'agence quand un dossier la rejoint.
--
-- Un locataire peut rattacher son dossier a une agence verifiee, par son
-- domaine (0022) ou par le lien de candidature d'un logement (0070).
-- L'agence n'en savait rien avant que le dossier soit complet. Le passage
-- d'un dossier sans agence a une agence programme desormais un evenement
-- `rattache`, livre comme les autres par la file des notifications : un
-- courriel aux membres de l'agence selon leurs preferences, sans aucune
-- donnee du candidat hormis la reference.
--
-- Un dossier ouvert par l'agence elle-meme nait avec son agence : il ne
-- declenche rien. Les dossiers de demonstration et de second garant non plus.

create function public.programmer_notification_rattachement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.agence_id is null and new.agence_id is not null
     and not new.demonstration and new.dossier_principal is null then
    insert into public.notifications_statut(dossier_id, statut) values (new.id, 'rattache');
  end if;
  return new;
end;
$$;
revoke all on function public.programmer_notification_rattachement()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger notification_rattachement after update of agence_id on public.dossiers
for each row execute function public.programmer_notification_rattachement();

-- Comme en 0067, avec l'evenement `rattache` : il reste valable tant que le
-- dossier a une agence et n'est ni pris, ni refuse, ni clos.
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
       when n.statut='rattache' then case when d.agence_id is not null
        and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
        then 'rattache' else 'obsolete' end
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
