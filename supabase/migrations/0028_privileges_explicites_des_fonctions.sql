-- Supabase accorde EXECUTE a anon/authenticated a la creation des fonctions.
-- REVOKE FROM public seul ne retire pas ces droits explicites.
-- Ne toucher qu'aux fonctions applicatives, pas aux fonctions gerees par Supabase.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
    'acquitter_notification',
    'agence_courante',
    'agence_reinitialise_verification',
    'consommer_debit',
    'contacts_agence_du_dossier',
    'declenche_recalcul_engagement',
    'declenche_recalcul_loyer',
    'declenche_recalcul_piece',
    'declenche_recalcul_seuil',
    'designer_garant_avec_lien',
    'dossier_courant',
    'dossier_prolonge_a_la_premiere_piece',
    'emettre_jeton',
    'est_admin_agence',
    'etat_file_courriels',
    'facture_a_la_signature',
    'jeton_est_actif',
    'journal_est_en_ecriture_seule',
    'journaliser',
    'marquer_dossier_paye',
    'memoriser_exclusion',
    'mettre_courriel_en_file',
    'mon_journal_acces',
    'notifications_a_livrer',
    'ouvrir_dossier',
    'ouvrir_dossier_avec_lien',
    'ouvrir_dossier_de_demonstration',
    'partie_courante',
    'piece_refusee_au_dela_du_plafond',
    'pieces_suffisantes',
    'prendre_courriels',
    'programmer_notification_statut',
    'proteger_dossier',
    'purger_les_dossiers_expires',
    'rattacher_mon_dossier',
    'recalculer_dossier',
    'refuser_ecriture_apres_transmission',
    'refuser_membre_exclu',
    'rejoindre_ou_creer_agence',
    'retrouver_lien_locataire',
    'terminer_courriel',
    'verifier_ouverture_agence',
    'verrouiller_donnees_garant'
  ) loop
    execute format('revoke all on function %s from public, anon, authenticated, porteur_lien, serveur, depot_piece',f.signature);
  end loop;
end $$;

-- Les fonctions de politique lisent uniquement le contexte de l'appelant.
grant execute on function public.agence_courante(),public.est_admin_agence() to authenticated;
grant execute on function public.dossier_courant(),public.partie_courante()
  to authenticated,porteur_lien,depot_piece;

grant execute on function public.rejoindre_ou_creer_agence(text),
  public.ouvrir_dossier_de_demonstration() to authenticated;
grant execute on function public.ouvrir_dossier(text),
  public.ouvrir_dossier_avec_lien(text,interval) to authenticated,serveur;
grant execute on function public.journaliser(uuid,text,uuid),
  public.contacts_agence_du_dossier(uuid) to authenticated,porteur_lien;
grant execute on function public.designer_garant_avec_lien(text),
  public.rattacher_mon_dossier(text),public.mon_journal_acces() to porteur_lien;

grant execute on function public.emettre_jeton(uuid,text,interval),
  public.jeton_est_actif(uuid,text,uuid),public.consommer_debit(text,text),
  public.marquer_dossier_paye(uuid,text),public.purger_les_dossiers_expires(),
  public.retrouver_lien_locataire(text,text),public.mettre_courriel_en_file(uuid,text),
  public.prendre_courriels(uuid),public.terminer_courriel(uuid,uuid,boolean),
  public.etat_file_courriels(),public.notifications_a_livrer(uuid),
  public.acquitter_notification(uuid) to serveur;

-- Le harnais conserve les defauts permissifs pour reproduire cette regression.
-- Chaque future fonction doit definir ses appelants explicitement.
