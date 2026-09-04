-- Qui prevenir a l'agence quand un dossier change.
--
-- « Pas de relance » est une promesse de la page d'accueil, et elle se tient
-- avec des notifications justes. Quand un dossier devient complet, l'agence
-- doit l'apprendre sans ouvrir son espace. Or les adresses des collaborateurs
-- vivent dans `auth.users`, que personne ne lit via l'API : ni le garant dont
-- le depot vient de completer le dossier, ni meme l'agence sur elle-meme.
--
-- Une fonction `security definer` plutot qu'un droit de table : elle ne rend
-- que les adresses de l'agence d'un dossier precis, et seulement a qui tient
-- ce dossier. Un garant n'obtient jamais la liste d'une autre agence, ni la
-- liste complete de la sienne hors de son dossier.

create function public.contacts_agence_du_dossier(le_dossier uuid)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.email
    from public.dossiers d
    join public.membres_agence m on m.agence_id = d.agence_id
    join auth.users u on u.id = m.utilisateur_id
   where d.id = le_dossier
     and u.email is not null
     and (
       -- Un porteur de lien, sur le dossier que son jeton designe.
       le_dossier = public.dossier_courant()
       -- Ou un collaborateur, sur un dossier de son agence.
       or d.agence_id = public.agence_courante()
     )
   order by u.email;
$$;

comment on function public.contacts_agence_du_dossier(uuid) is
  'Les adresses des collaborateurs de l agence d un dossier, pour qui tient ce dossier. Rien pour les autres.';

revoke all on function public.contacts_agence_du_dossier(uuid) from public;
grant execute on function public.contacts_agence_du_dossier(uuid) to porteur_lien, authenticated;
