import { expect, test } from 'vitest'
import { join } from 'node:path'
import { executerProcessus } from '@/lib/coffre/processus-limite'

const script = join(process.cwd(), 'tests/fixtures/processus.mjs')
test('un decodeur bloque est tue et son slot devient reutilisable', async () => {
  let parentDisponible = false
  const minuteur = setTimeout(() => {
    parentDisponible = true
  }, 10)
  await expect(executerProcessus(script, Buffer.from('bloque'), { delai: 200 })).rejects.toThrow(
    'trop long',
  )
  clearTimeout(minuteur)
  expect(parentDisponible).toBe(true)
  expect(JSON.parse((await executerProcessus(script, Buffer.from('ok'))).toString()).mode).toBe(
    'ok',
  )
})
test('une sortie excessive est interrompue', async () => {
  await expect(
    executerProcessus(script, Buffer.from('sortie'), { sortieMax: 1024 }),
  ).rejects.toThrow('Sortie trop volumineuse')
})
test('le troisieme traitement est refuse sans file en memoire', async () => {
  const traitements = [1, 2].map(() =>
    executerProcessus(script, Buffer.from('bloque'), { delai: 300 }).catch((e) => e),
  )
  await expect(executerProcessus(script, Buffer.from('ok'))).rejects.toThrow('occupe')
  const resultats = await Promise.all(traitements)
  for (const resultat of resultats) expect(resultat).toBeInstanceOf(Error)
})
test('les secrets applicatifs ne sont pas herites par le decodeur', async () => {
  const precedent = process.env.CLE_MAITRESSE
  process.env.CLE_MAITRESSE = 'canari-test-sans-valeur'
  try {
    const sortie = await executerProcessus(script, Buffer.from('ok'))
    expect(JSON.parse(sortie.toString()).secret).toBe(false)
  } finally {
    if (precedent === undefined) delete process.env.CLE_MAITRESSE
    else process.env.CLE_MAITRESSE = precedent
  }
})
