-- Montee en charge : index, politiques evaluees une fois par requete, purge bornee.
--
-- Rien ne change dans ce que chaque role peut lire ou ecrire. Trois gestes :
--
-- 1. Des index pour les lectures qui grandissent avec le nombre de dossiers,
--    de courriels et d'actes, et pour les cles etrangeres que la purge parcourt
--    a chaque dossier supprime.
-- 2. Les politiques appellent leurs fonctions d'identite dans un sous-select.
--    `agence_id = public.agence_courante()` peut etre recalcule a chaque ligne
--    lue quand le planificateur filtre au lieu de passer par un index ;
--    `(select public.agence_courante())` devient un plan initial, calcule une
--    fois par requete. Les expressions sont sinon identiques, reprises du
--    catalogue telles que les migrations precedentes les ont laissees.
-- 3. La purge des dossiers expires traite un lot borne par passage, au lieu de
--    tout l'arriere dans une seule transaction qui finirait par depasser son
--    delai et tout annuler.

-- 1. Index -----------------------------------------------------------------

-- La liste de l'agence : plus recents d'abord, page par page. Remplace
-- l'index sur la seule agence, dont il reprend la premiere colonne.
create index dossiers_agence_recents on public.dossiers (agence_id, cree_le desc, id desc);
drop index public.dossiers_agence_idx;
-- Les indicateurs de pilotage et le filtre par statut.
create index dossiers_agence_statut on public.dossiers (agence_id, statut);
-- Le tri et l'horizon par echeance.
create index dossiers_agence_echeance on public.dossiers (agence_id, expire_le);
-- La purge ne relit pas les dossiers signes deja vides de leur coffre.
create index dossiers_a_purger on public.dossiers (expire_le) where coffre_purge_le is null;

-- La file des courriels : chaque envoi et chaque passage de maintenance
-- cherchent les messages en attente, ceux a reconcilier et ceux a effacer.
create index courriels_en_attente on public.courriels_sortants (cree_le)
  where envoye_le is null and annule_le is null;
create index courriels_a_reconcilier on public.courriels_sortants (id)
  where a_reconcilier and annule_le is null;
create index courriels_retention on public.courriels_sortants (cree_le);

-- Doublon exact du prefixe de journal_acces_dossier_curseur (0041) : un index
-- de moins a tenir sur la table la plus ecrite.
drop index public.journal_acces_dossier_idx;

-- Cles etrangeres vers un dossier, sans index : chaque suppression de dossier
-- parcourait ces tables en entier.
create index notifications_statut_dossier on public.notifications_statut (dossier_id);
create index notifications_statut_complement on public.notifications_statut (complement_id)
  where complement_id is not null;
create index examens_dossier on public.examens_documentaires (dossier_id);
create index demandes_signature_dossier on public.demandes_signature (dossier_id);
create index registre_paiements_dossier on public.registre_paiements (dossier_id);
create index journal_signatures_acte on public.journal_signatures (acte_id);

-- Les registres de l'agence, pagines par date.
create index actes_signature_agence on public.actes_signature (agence_id, archive_le desc, id desc);
create index factures_actes_agence on public.factures_actes (agence_id, cree_le desc, id desc);

-- Les seaux de debit d'une cle qui ne revient jamais ne s'effacaient pas.
create index debits_fenetre on public.debits (fenetre);

-- 2. Politiques : identite calculee une fois par requete ---------------------

alter policy "Agence lit ses responsables" on public.affectations_dossiers
  using ((EXISTS ( SELECT 1
   FROM public.dossiers d
  WHERE ((d.id = affectations_dossiers.dossier_id) AND (d.agence_id = (select public.agence_courante())) AND (d.expire_le > clock_timestamp())))));
alter policy "Un admin decrit son agence" on public.agences
  using (((id = (select public.agence_courante())) AND (select public.est_admin_agence()) AND (statut <> 'suspendue'::text)))
  with check ((id = (select public.agence_courante())));
alter policy "Un membre voit son agence" on public.agences
  using ((id = (select public.agence_courante())));
alter policy "Le garant lit la cle de son dossier" on public.cles_dossier
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Le garant scelle la cle de son dossier" on public.cles_dossier
  with check (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Une agence lit la cle de ses dossiers" on public.cles_dossier
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE (dossiers.agence_id = (select public.agence_courante())))));
alter policy "Agence du dossier lit les complements" on public.complements_documentaires
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE (dossiers.agence_id = (select public.agence_courante())))));
alter policy "Garant du dossier lit les complements" on public.complements_documentaires
  using ((((select public.partie_courante()) = 'garant'::text) AND (dossier_id = (select public.dossier_courant()))));
alter policy "Administrateur lit ses connecteurs" on public.connecteurs_agence
  using (((agence_id = (select public.agence_courante())) AND (EXISTS ( SELECT 1
   FROM public.membres_agence m
  WHERE ((m.agence_id = connecteurs_agence.agence_id) AND (m.utilisateur_id = (select auth.uid())) AND (m.role = 'admin'::text))))));
alter policy "Le locataire designe son garant" on public.dossiers
  using (((id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'locataire'::text)))
  with check (((id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'locataire'::text)));
alter policy "Un porteur de lien voit le sien" on public.dossiers
  using ((id = (select public.dossier_courant())));
alter policy "Une agence fait avancer ses dossiers" on public.dossiers
  using ((agence_id = (select public.agence_courante())))
  with check ((agence_id = (select public.agence_courante())));
alter policy "Une agence voit ses dossiers" on public.dossiers
  using ((agence_id = (select public.agence_courante())));
alter policy "Le garant corrige ce qu il couvre" on public.engagements
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)))
  with check (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Le garant declare ce qu il couvre" on public.engagements
  with check (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Le garant lit son engagement" on public.engagements
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Une agence lit l engagement de ses dossiers" on public.engagements
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE (dossiers.agence_id = (select public.agence_courante())))));
alter policy "Agence lit ses examens" on public.examens_documentaires
  using ((EXISTS ( SELECT 1
   FROM public.dossiers d
  WHERE ((d.id = examens_documentaires.dossier_id) AND (d.agence_id = (select public.agence_courante())) AND (d.expire_le > clock_timestamp()) AND (d.statut <> 'expire'::text)))));
alter policy "Une agence lit ses factures" on public.factures_actes
  using ((agence_id = (select public.agence_courante())));
alter policy "Le garant lit le journal de son dossier" on public.journal_acces
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Une agence lit le journal de ses dossiers" on public.journal_acces
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE (dossiers.agence_id = (select public.agence_courante())))));
alter policy "administration_lit_journal" on public.journal_administration_agence
  using (((agence_id = (select public.agence_courante())) AND (select public.est_admin_agence())));
alter policy "Une agence cree ses logements" on public.logements
  with check ((agence_id = (select public.agence_courante())));
alter policy "Une agence lit ses logements" on public.logements
  using ((agence_id = (select public.agence_courante())));
alter policy "Une agence modifie ses logements" on public.logements
  using ((agence_id = (select public.agence_courante())))
  with check ((agence_id = (select public.agence_courante())));
alter policy "Une agence supprime ses logements" on public.logements
  using ((agence_id = (select public.agence_courante())));
alter policy "Un admin change le role d'un collegue" on public.membres_agence
  using (((agence_id = (select public.agence_courante())) AND (select public.est_admin_agence())))
  with check ((agence_id = (select public.agence_courante())));
alter policy "Un admin retire un collegue" on public.membres_agence
  using (((agence_id = (select public.agence_courante())) AND (select public.est_admin_agence()) AND (utilisateur_id <> (select auth.uid()))));
alter policy "Un membre voit ses collegues" on public.membres_agence
  using ((agence_id = (select public.agence_courante())));
alter policy "Le garant depose" on public.pieces
  with check (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Le garant lit ses pieces" on public.pieces
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Le garant retire une piece avant transmission" on public.pieces
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text) AND (EXISTS ( SELECT 1
   FROM public.dossiers d
  WHERE ((d.id = pieces.dossier_id) AND (d.statut = ANY (ARRAY['ouvert'::text, 'depot_en_cours'::text, 'complet'::text, 'garant_insuffisant'::text])))))));
alter policy "Le serveur inscrit le depot valide" on public.pieces
  with check (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Le serveur relit le depot inscrit" on public.pieces
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Une agence lit les pieces de ses dossiers" on public.pieces
  using ((dossier_id IN ( SELECT dossiers.id
   FROM public.dossiers
  WHERE (dossiers.agence_id = (select public.agence_courante())))));
alter policy "Membre lit ses preferences" on public.preferences_notifications
  using (((utilisateur_id = (select auth.uid())) AND ((select public.agence_courante()) IS NOT NULL)));
alter policy "Garant lit la provenance de ses copies" on public.provenances_pieces
  using (((dossier_id = (select public.dossier_courant())) AND ((select public.partie_courante()) = 'garant'::text)));
alter policy "Admin lit les rappels" on public.reglages_rappels
  using (((agence_id = (select public.agence_courante())) AND (select public.est_admin_agence())));
alter policy "Le garant depose dans le dossier de son lien" on storage.objects
  with check (((bucket_id = 'pieces'::text) AND ((select public.partie_courante()) = 'garant'::text) AND (name ~~ (((select public.dossier_courant()))::text || '/%'::text))));
alter policy "Le garant relit ce qu il a depose" on storage.objects
  using (((bucket_id = 'pieces'::text) AND ((select public.partie_courante()) = 'garant'::text) AND (name ~~ (((select public.dossier_courant()))::text || '/%'::text))));
alter policy "Le garant retire ses octets avant transmission" on storage.objects
  using (((bucket_id = 'pieces'::text) AND ((select public.partie_courante()) = 'garant'::text) AND (name ~~ (((select public.dossier_courant()))::text || '/%'::text)) AND (EXISTS ( SELECT 1
   FROM public.dossiers d
  WHERE ((d.id = (select public.dossier_courant())) AND (d.statut = ANY (ARRAY['ouvert'::text, 'depot_en_cours'::text, 'complet'::text, 'garant_insuffisant'::text])))))));
alter policy "Le serveur rattrape son depot" on storage.objects
  using (((bucket_id = 'pieces'::text) AND (((NULLIF(current_setting('request.jwt.claims'::text, true), ''::text))::jsonb ->> 'role_partie'::text) = 'garant'::text) AND (name ~~ (((select public.dossier_courant()))::text || '/%'::text))));
alter policy "Le serveur retrouve son depot" on storage.objects
  using (((bucket_id = 'pieces'::text) AND (((NULLIF(current_setting('request.jwt.claims'::text, true), ''::text))::jsonb ->> 'role_partie'::text) = 'garant'::text) AND (name ~~ (((select public.dossier_courant()))::text || '/%'::text))));
alter policy "Une agence lit les octets de ses dossiers" on storage.objects
  using (((bucket_id = 'pieces'::text) AND (EXISTS ( SELECT 1
   FROM public.dossiers d
  WHERE ((d.agence_id = (select public.agence_courante())) AND (objects.name ~~ ((d.id)::text || '/%'::text)))))));

-- 3. Purge bornee -------------------------------------------------------------

-- Meme corps que la 0038, avec deux bornes : deux cents dossiers par passage,
-- et les seaux de debit de plus de deux jours (la plus longue fenetre dure une
-- heure). Le passage suivant, un quart d'heure plus tard, prend la suite.
create or replace function public.purger_les_dossiers_expires()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d record; nombre integer := 0;
begin
  delete from public.journal_administration_agence where id in (
    select id from public.journal_administration_agence where quand < now()-interval '90 days' order by quand limit 5000
  );
  delete from public.debits where (cle, fenetre) in (
    select cle, fenetre from public.debits where fenetre < now()-interval '2 days' order by fenetre limit 5000
  );
  for d in select id,statut from public.dossiers
    where expire_le < now() and coffre_purge_le is null
    order by expire_le limit 200 for update skip locked loop
    insert into public.objets_a_supprimer(chemin)
      select name from storage.objects where bucket_id='pieces' and name like d.id::text||'/%'
      union select chemin from public.pieces where dossier_id=d.id
      on conflict do nothing;
    -- Plus aucune cle vivante, meme si Storage est momentanement indisponible.
    delete from public.jetons_actifs where dossier_id=d.id;
    delete from public.cles_dossier where dossier_id=d.id;
    delete from public.engagements where dossier_id=d.id;
    delete from public.pieces where dossier_id=d.id;
    delete from public.journal_acces where dossier_id=d.id;
    if d.statut='signe' then
      update public.dossiers set coffre_purge_le=now() where id=d.id;
    else
      delete from public.dossiers where id=d.id;
    end if;
    nombre := nombre + 1;
  end loop;
  return nombre;
end $$;
grant execute on function public.purger_les_dossiers_expires() to serveur;
comment on function public.purger_les_dossiers_expires() is
  'Detruit les cles et met les octets expires en file, deux cents dossiers par passage. Le travailleur doit ensuite appeler Storage.remove et acquitter chaque chemin.';
