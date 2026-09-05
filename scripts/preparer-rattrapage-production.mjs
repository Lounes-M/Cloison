import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

// Plan specifique au schema Cloison observe le 6 septembre 2026.
// Ne remplace pas un outil general de migration et ne contacte aucun service.
const migrations = [
  '0010_porte_du_locataire.sql',
  '0011_ratio_de_solvabilite.sql',
  '0012_barriere_de_verification.sql',
  '0013_dossier_de_demonstration.sql',
  '0017_purge_a_trois_mois.sql',
  '0019_fonctions_reservees_au_serveur.sql',
  '0020_confidentialite_et_revocation.sql',
  '0021_purge_physique.sql',
  '0022_retrouver_et_rattacher.sql',
  '0023_sessions_et_collecte.sql',
  '0024_depot_reserve.sql',
  '0025_courriels_durables.sql',
  '0026_journal_du_garant.sql',
  '0027_notifications_de_statut.sql',
]
const repetition = process.argv.includes('--repetition')
const entete = `-- CLOISON : rattrapage du schema observe le 6 septembre 2026.
-- Transaction unique : la moindre erreur annule tout.
-- Fermer l'editeur apres erreur pour ne pas garder une transaction ouverte.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
lock table public.dossiers, public.pieces in access exclusive mode;
do $$ begin
  if exists(select 1 from public.dossiers) or exists(select 1 from public.pieces) then
    raise exception 'Ce plan exige le schema initial sans dossier ni piece. Refaire l inventaire.';
  end if;
  if to_regprocedure('public.ouvrir_dossier_avec_lien(text,interval)') is not null
    or to_regclass('public.courriels_sortants') is not null
    or exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='dossiers' and column_name in ('loyer_cents','demonstration')) then
    raise exception 'Le schema a change depuis l inventaire. Ne pas rejouer ce plan.';
  end if;
end $$;
`
const morceaux = [entete]
for (const fichier of migrations) {
  const contenu = await readFile(join(process.cwd(), 'supabase/migrations', fichier), 'utf8')
  const empreinte = createHash('sha256').update(contenu).digest('hex')
  morceaux.push(`-- Source ${fichier}, SHA256 ${empreinte}\n${contenu}`)
}
morceaux.push(`
do $$ begin
  if has_function_privilege('anon','public.emettre_jeton(uuid,text,interval)','execute')
    or not has_function_privilege('serveur','public.emettre_jeton(uuid,text,interval)','execute')
    or to_regclass('public.courriels_sortants') is null
    or to_regclass('public.objets_a_supprimer') is null
    or to_regprocedure('public.recalculer_dossier(uuid)') is null then
    raise exception 'Postconditions du rattrapage non satisfaites.';
  end if;
end $$;
notify pgrst, 'reload schema';
${repetition ? 'rollback;' : 'commit;'}
`)
process.stdout.write(morceaux.join('\n'))
