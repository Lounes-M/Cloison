import { readFileSync } from 'node:fs'
// Base jetable controlee par test-postgrest, aucune connexion de production.
export async function verifierHistoriqueResponsables(db) {
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/historique-responsables.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  console.log(
    'OK : historique des responsables, roles reels, exclusion Auth et retention des dossiers signes',
  )
}
