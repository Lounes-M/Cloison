import { baseDEssai } from '../tests/base.ts'
// Outil de lecture pour preparer une reference reviewable, jamais d'ecriture automatique.
const db = await baseDEssai()
try {
  const { rows } = await db.query('select public.empreinte_schema() as empreinte')
  console.log(JSON.stringify(rows[0].empreinte, null, 2))
} finally {
  await db.close()
}
