-- La porte du locataire : ouvrir un dossier ET recevoir le lien, d'un seul geste.
--
-- Le socle avait pose deux fonctions qui ne se parlent pas. `ouvrir_dossier`
-- rend la reference, lisible par une personne. `emettre_jeton` attend l'uuid.
-- Et `anon` ne lit pas `dossiers`, donc il ne peut pas passer de l'une a
-- l'autre. Le serveur pouvait ouvrir un dossier, mais pas donner a la personne
-- le moyen d'y revenir. Le trou n'est apparu qu'au premier appelant reel.
--
-- Une fonction qui fait les deux, plutot que de changer ce que `ouvrir_dossier`
-- rend : celle-ci est appliquee en production et citee par les tests, et une
-- transaction unique est de toute facon ce qu'on veut. Un dossier sans son
-- premier lien est un dossier que personne ne pourra jamais ouvrir ; il vaut
-- mieux qu'il n'existe pas du tout que d'exister orphelin.
--
-- Elle s'execute avec les droits du proprietaire (`security definer`), ce qui
-- lui permet de relire le dossier qu'elle vient de creer. Elle ne rend a
-- l'appelant que ce dont le serveur a besoin pour signer et pour ecrire le
-- courriel : l'uuid ne sert a rien sans jeton, et le jeton n'est pas ici.

create function public.ouvrir_dossier_avec_lien(email_du_locataire text, duree interval)
returns table (dossier_id uuid, reference text, jti uuid, expire_le timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  la_reference text;
  le_dossier   uuid;
begin
  -- Le seul chemin de creation reste `ouvrir_dossier` : ses regles (adresse
  -- valide, rattachement a l'agence si l'appelant en est membre) s'appliquent
  -- sans etre recopiees ici.
  la_reference := public.ouvrir_dossier(email_du_locataire);

  select d.id into le_dossier
    from public.dossiers d
   where d.reference = la_reference;

  return query
    select le_dossier, la_reference, j.jti, j.expire_le
      from public.emettre_jeton(le_dossier, 'locataire', duree) j;
end;
$$;

comment on function public.ouvrir_dossier_avec_lien(text, interval) is
  'Ouvre un dossier et emet le premier lien du locataire, dans une seule transaction.';

revoke all on function public.ouvrir_dossier_avec_lien(text, interval) from public;

-- Les memes appelants que `ouvrir_dossier` : le locataire avant tout jeton, et
-- l'agence qui ouvre pour lui.
grant execute on function public.ouvrir_dossier_avec_lien(text, interval) to anon, authenticated;
