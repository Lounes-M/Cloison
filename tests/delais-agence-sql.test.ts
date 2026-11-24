import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'

/**
 * L'alerte sur les 48 heures ouvrées promises aux agences (0093).
 *
 * Ce qui compte : le délai saute le week-end à l'heure de Paris ; une demande
 * de démonstration ou d'activation sans réponse sonne une fois quand il reste
 * un jour ouvré, une fois quand le délai est dépassé ; la réponse éteint
 * l'alerte ; une activation redemandée la réarme ; seul le serveur lit.
 */

let db: PGlite

beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})

type Alerte = { nature: string; objet: string; depuis: string; palier: string; nom: string }
async function dues() {
  await devenir(db, 'serveur')
  const lignes = (await db.query<Alerte>('select * from delais_agence_a_alerter()')).rows
  await redevenirProprietaire(db)
  return lignes
}
async function acquitter(a: Alerte, palier = a.palier) {
  await devenir(db, 'serveur')
  const r = (
    await db.query<{ r: boolean }>('select acquitter_alerte_delai($1,$2,$3,$4) r', [
      a.nature,
      a.objet,
      a.depuis,
      palier,
    ])
  ).rows[0]!.r
  await redevenirProprietaire(db)
  return r
}
/** Une demande de démonstration reçue à l'instant décrit par l'expression SQL. */
async function demande(recue: string, nom = 'Agence Bellevue') {
  const id = randomUUID()
  await db.query(
    `insert into demandes_agence(id,nom_agence,email,ville,dossiers_par_an,cree_le)
     values($1,$2,$3,'Lyon','10-50',${recue})`,
    [id, nom, `${id}@example.invalid`],
  )
  return id
}
/** Un instant où un jour ouvré est passé, mais pas deux, quel que soit le jour du test. */
const ENTRE_UN_ET_DEUX_JOURS = `(select now()-make_interval(hours=>h) from generate_series(1,200) h
  where echeance_ouvree(now()-make_interval(hours=>h),1)<=now()
    and echeance_ouvree(now()-make_interval(hours=>h),2)>now() order by h limit 1)`

test.each([
  // Lundi 10 h, heure d'hiver : mercredi 10 h.
  ['2026-11-23T09:00:00Z', 2, '2026-11-25T09:00:00.000Z'],
  // Jeudi : le délai enjambe le week-end.
  ['2026-11-26T09:00:00Z', 2, '2026-11-30T09:00:00.000Z'],
  ['2026-11-27T09:00:00Z', 1, '2026-11-30T09:00:00.000Z'],
  // Samedi et dimanche partent du lundi à minuit, heure de Paris.
  ['2026-11-28T15:00:00Z', 2, '2026-12-01T23:00:00.000Z'],
  ['2026-11-29T22:59:00Z', 1, '2026-11-30T23:00:00.000Z'],
  // Dimanche 23 h 30 UTC : déjà lundi à Paris.
  ['2026-11-29T23:30:00Z', 1, '2026-11-30T23:30:00.000Z'],
  // Le passage à l'heure d'été garde l'heure locale.
  ['2026-03-27T09:00:00Z', 2, '2026-03-31T08:00:00.000Z'],
])('%s plus %i jour(s) ouvré(s) échoit le %s', async (depuis, jours, attendu) => {
  const { rows } = await db.query<{ e: Date }>('select echeance_ouvree($1,$2) e', [depuis, jours])
  expect(rows[0]!.e.toISOString()).toBe(attendu)
})

test('une demande récente ne sonne pas, une demande hors délai sonne une seule fois', async () => {
  await demande("now()-interval '1 hour'", 'Récente')
  const ancienne = await demande("now()-interval '10 days'", 'Oubliée')
  const [alerte, ...reste] = await dues()
  expect(reste).toEqual([])
  expect(alerte).toMatchObject({ nature: 'demande', objet: ancienne, palier: 'depasse' })
  expect(await acquitter(alerte!)).toBe(true)
  expect(await dues()).toEqual([])
})

test('il reste un jour ouvré : une première alerte, puis celle du dépassement', async () => {
  const id = await demande(ENTRE_UN_ET_DEUX_JOURS)
  const [proche] = await dues()
  expect(proche).toMatchObject({ objet: id, palier: 'proche' })
  await acquitter(proche!)
  expect(await dues()).toEqual([])
  // Le temps passe sans réponse.
  await db.query("update demandes_agence set cree_le=cree_le-interval '10 days' where id=$1", [id])
  const [depasse] = await dues()
  expect(depasse).toMatchObject({ objet: id, palier: 'depasse' })
  await acquitter(depasse!)
  expect(await dues()).toEqual([])
})

test('une demande déjà alertée hors délai ne reçoit pas l’alerte « proche »', async () => {
  const id = await demande(ENTRE_UN_ET_DEUX_JOURS)
  const [proche] = await dues()
  await acquitter(proche!, 'depasse')
  expect((await dues()).filter((a) => a.objet === id)).toEqual([])
})

test('la réponse éteint l’alerte et refuse son acquittement', async () => {
  const id = await demande("now()-interval '10 days'")
  const [alerte] = await dues()
  await db.query("update demandes_agence set statut='contactee' where id=$1", [id])
  expect(await dues()).toEqual([])
  expect(await acquitter(alerte!)).toBe(false)
})

test('une activation en attente sonne, la vérification l’éteint, une nouvelle demande la réarme', async () => {
  const agence = randomUUID()
  await db.query(
    `insert into agences(id,nom,domaine,siren,carte_pro,activation_demandee_le)
     values($1,'Agence Bellevue','bellevue.invalid','123456789','CPI 6901 2026 000 000 001',now()-interval '10 days')`,
    [agence],
  )
  const [alerte] = await dues()
  expect(alerte).toMatchObject({ nature: 'activation', objet: agence, palier: 'depasse' })
  await acquitter(alerte!)
  expect(await dues()).toEqual([])
  // Refusée puis redemandée : la nouvelle date porte ses propres alertes.
  await db.query("update agences set activation_demandee_le=now()-interval '9 days' where id=$1", [
    agence,
  ])
  expect(await acquitter(alerte!)).toBe(false)
  expect(await dues()).toHaveLength(1)
  await db.query("update agences set statut='verifiee',verifiee_le=now() where id=$1", [agence])
  expect(await dues()).toEqual([])
})

test('une agence qui n’a rien demandé ne sonne pas', async () => {
  await db.query("insert into agences(nom,domaine) values('Découverte','decouverte.invalid')")
  expect(await dues()).toEqual([])
})

test('seul le serveur lit et acquitte, et le registre reste fermé', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
    await db.exec('savepoint s')
    await devenir(db, role, randomUUID())
    await refus(db, 'select * from delais_agence_a_alerter()')
    await db.exec('rollback to savepoint s')
    await redevenirProprietaire(db)
  }
  await db.exec('savepoint s')
  await devenir(db, 'serveur')
  await refus(db, 'select * from alertes_delai_agence')
  await db.exec('rollback to savepoint s')
  await devenir(db, 'serveur')
  await refus(db, 'select * from demandes_agence_en_attente()')
})
