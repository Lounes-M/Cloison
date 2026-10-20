import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { nouvelleCle, sceller } from '../lib/coffre/enveloppe'
import { scellerAvecTrousseau } from '../lib/coffre/rotation-format'
import { scellerFichierActe } from '../lib/signature/archive-format'
import {
  copierStockage,
  inventaireStockage,
  stockageSupabase,
  verifierRestauration,
  // @ts-expect-error Outil Node autonome execute avec Node 24.
} from '../scripts/restauration-supabase.mjs'
import { baseDEssai } from './base'

const PRODUCTION = 'productionprojetabcd'
const RESTAURATION = 'restaurationprojetab'
const reference = JSON.parse(readFileSync('tests/fixtures/schema-locale.json', 'utf8'))
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

type Objets = Map<string, Buffer>
/** Doublure Storage : `sansOctets` imite une metadonnee restauree sans fichier. */
function stockageMemoire(
  projet: string,
  objets: Objets = new Map(),
  sansOctets = new Set<string>(),
) {
  return {
    projet,
    objets,
    async chemins(seau: string) {
      return [...objets.keys(), ...sansOctets]
        .filter((c) => c.startsWith(`${seau}:`))
        .map((c) => c.slice(seau.length + 1))
        .sort()
    },
    async lire(seau: string, chemin: string) {
      const o = objets.get(`${seau}:${chemin}`)
      return o ? Buffer.from(o) : null
    },
    async deposer(seau: string, chemin: string, octets: Buffer, { remplacer = false } = {}) {
      const cle = `${seau}:${chemin}`
      if (!remplacer && (objets.has(cle) || sansOctets.has(cle))) return 'existe'
      sansOctets.delete(cle)
      objets.set(cle, Buffer.from(octets))
      return 'depose'
    },
  }
}

let db: PGlite
let kek: Buffer
let fixture: Awaited<ReturnType<typeof preparer>>
const base = () => ({
  query: async (sql: string, params: unknown[] = []) => db.query(sql, params),
})

async function preparer() {
  const dossier = randomUUID(),
    dek = nouvelleCle(),
    chemin = `${dossier}/${randomUUID()}`
  const piece = sceller(Buffer.from('%PDF-1.7 piece fictive'), dek)
  await db.query(
    "insert into dossiers(id,email_locataire,email_garant) values($1,'restauration@example.invalid','garant@example.invalid')",
    [dossier],
  )
  await db.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
    dossier,
    sceller(dek, kek),
  ])
  await db.query('insert into reservations_depot(dossier_id,chemin) values($1,$2)', [
    dossier,
    chemin,
  ])
  await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
  await db.query(
    "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values($1,'bulletin_paie',$2,$3,'application/pdf')",
    [dossier, chemin, piece.length],
  )
  await db.query(
    'insert into brouillons_engagement(dossier_id,version_conditions,chiffre) values($1,0,$2)',
    [dossier, sceller(Buffer.from('{"usage":"brouillon-engagement-v1"}'), dek)],
  )
  await db.query('insert into courriels_sortants(id,contenu) values(gen_random_uuid(),$1)', [
    sceller(Buffer.from('courriel fictif'), kek).toString('base64'),
  ])
  // Acte archive, chiffre par sa propre DEK scellee par la cle maitresse.
  const dekActe = nouvelleCle()
  await db.query("insert into agences(id,nom,domaine) values($1,'Recette','recette.invalid')", [
    dossier,
  ])
  await db.query(
    "insert into demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte) values($1,$1,$1,'sandbox',repeat('a',64))",
    [dossier],
  )
  await db.query(
    "insert into actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,expire_signature,conserver_jusqu_au) values($1,$1,'recette',1,$2,$2,now()+interval '1 day',now()+interval '2 days')",
    [dossier, sceller(dekActe, kek)],
  )
  const pdf = Buffer.from('%PDF-1.7 acte fictif')
  const nonce = randomBytes(12)
  const {
    rows: [f],
  } = await db.query<{ id: string }>(
    "insert into fichiers_signature(acte_id,nature,empreinte,taille,nonce,confirme) values($1,'acte',$2,$3,$4,true) returning id",
    [dossier, sha256(pdf), pdf.length, nonce],
  )
  const acte = scellerFichierActe(pdf, dekActe, {
    id: f!.id,
    acte_id: dossier,
    nature: 'acte',
    empreinte: sha256(pdf),
    taille: pdf.length,
    nonce: `\\x${nonce.toString('hex')}`,
    confirme: true,
  })
  // Remise de droits encore disponible : seule son empreinte est verifiable.
  const remise = randomUUID(),
    archive = randomBytes(64)
  const decision = 'b'.repeat(64)
  await db.query(
    `insert into remises_droits(id,demande,revision,approbation_sha256,jeton_sha256,preuve_acces_sha256,archive_sha256,taille,manifeste,expire_le,disponible)
     values($1,$2::uuid,$3::uuid,$4,$4,$4,$5,64,jsonb_build_object('demande',$2::text,'revision',$3::text,'decisionSha256',$4::text),now()+interval '1 day',true)`,
    [remise, randomUUID(), randomUUID(), decision, sha256(archive)],
  )
  const production: Objets = new Map([
    [`pieces:${chemin}`, piece],
    [`actes:${dossier}/${f!.id}`, acte],
    [`exports-droits:${remise}`, archive],
  ])
  return { dossier, chemin, production }
}

beforeEach(async () => {
  db = await baseDEssai()
  kek = nouvelleCle()
  fixture = await preparer()
}, 120_000)
afterEach(async () => {
  await db.close()
})

test('copie Storage puis verification complete avec la seule copie de secours', async () => {
  const source = stockageMemoire(PRODUCTION, fixture.production)
  // La restauration de base ramene storage.objects sans les octets.
  const cible = stockageMemoire(RESTAURATION, new Map(), new Set([`pieces:${fixture.chemin}`]))
  const copie = await copierStockage(source, cible, { production: PRODUCTION })
  expect(copie.pieces).toMatchObject({ objets: 1, completes: 1, divergents: 0 })
  expect(copie.actes).toMatchObject({ objets: 1, copies: 1 })
  expect(copie['exports-droits']).toMatchObject({ objets: 1, copies: 1 })
  expect(await inventaireStockage(cible)).toEqual(await inventaireStockage(source))
  // Rejouable : rien n'est recopie ni ecrase.
  const reprise = await copierStockage(source, cible, { production: PRODUCTION })
  expect(reprise.pieces).toMatchObject({ deja: 1, copies: 0, completes: 0 })

  const bilan = await verifierRestauration(
    base(),
    cible,
    { historique: kek, active: null, lecture: [] },
    { reference },
  )
  expect(bilan).toMatchObject({
    schema: 'conforme',
    auth: { membres_sans_compte: 0 },
    cles: { dossiers: 1, actes: 1, illisibles: 0 },
    courriels: { examines: 1, illisibles: 0 },
    brouillons: { examines: 1, illisibles: 0 },
    pieces: { examinees: 1, ouvertes: 1, sans_objet: 0 },
    actes: { examines: 1, ouverts: 1 },
    remises: { examinees: 1, conformes: 1 },
    objets_sans_ligne: { pieces: 0, actes: 0, 'exports-droits': 0 },
    purges_a_rejouer: 0,
    erreurs: [],
  })
  // Aucun identifiant ni contenu dans le bilan publie.
  expect(JSON.stringify(bilan)).not.toContain(fixture.dossier)
})

test('une cle maitresse incorrecte ou incomplete fait echouer la verification', async () => {
  const cible = stockageMemoire(RESTAURATION, new Map(fixture.production))
  const fausse = await verifierRestauration(base(), cible, {
    historique: nouvelleCle(),
    active: null,
    lecture: [],
  })
  expect(fausse.cles.illisibles).toBe(2)
  expect(fausse.pieces.sans_cle).toBe(1)
  expect(fausse.courriels.illisibles).toBe(1)
  expect(fausse.erreurs).toEqual(expect.arrayContaining(['cles', 'pieces', 'actes', 'courriels']))

  // Apres rotation, la copie de secours doit contenir la nouvelle cle active.
  const active = nouvelleCle()
  const { rows } = await db.query<{ cle_scellee: Uint8Array }>(
    'select cle_scellee from cles_dossier',
  )
  const dek = (await import('../lib/coffre/rotation-format')).ouvrirAvecTrousseau(
    Buffer.from(rows[0]!.cle_scellee),
    { historique: kek, active: null, lecture: [] },
  )
  await db.query('update cles_dossier set cle_scellee=$1', [
    scellerAvecTrousseau(dek, { historique: kek, active, lecture: [] }),
  ])
  const ancienne = await verifierRestauration(base(), cible, {
    historique: kek,
    active: null,
    lecture: [],
  })
  expect(ancienne.cles.illisibles).toBe(1)
  const complete = await verifierRestauration(base(), cible, {
    historique: kek,
    active,
    lecture: [],
  })
  expect(complete.erreurs).toEqual([])
})

test('objet altere, manquant, orphelin ou purge a rejouer sont signales', async () => {
  const objets = new Map(fixture.production)
  const cle = `pieces:${fixture.chemin}`
  const altere = Buffer.from(objets.get(cle)!)
  altere[altere.length - 1]! ^= 1
  objets.set(cle, altere)
  const cible = stockageMemoire(RESTAURATION, objets)
  const trousseau = { historique: kek, active: null, lecture: [] }
  expect((await verifierRestauration(base(), cible, trousseau)).pieces.illisibles).toBe(1)

  objets.delete(cle)
  objets.set(`pieces:${fixture.dossier}/posterieur`, Buffer.from('depot apres sauvegarde'))
  const purge = `${fixture.dossier}/purge`
  await db.query('insert into objets_a_supprimer(chemin) values($1)', [purge])
  objets.set(`pieces:${purge}`, Buffer.from('purge en production apres sauvegarde'))
  const bilan = await verifierRestauration(base(), cible, trousseau)
  expect(bilan.pieces.sans_objet).toBe(1)
  expect(bilan.objets_sans_ligne.pieces).toBe(1)
  expect(bilan.purges_a_rejouer).toBe(1)
  expect(bilan.erreurs).toContain('pieces')
})

test('un rattachement agence sans compte Auth restaure est refuse', async () => {
  // pg_restore en mode replica n'applique pas les cles etrangeres.
  await db.query('set session_replication_role = replica')
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,gen_random_uuid(),'admin')",
    [fixture.dossier],
  )
  await db.query('set session_replication_role = origin')
  const bilan = await verifierRestauration(
    base(),
    stockageMemoire(RESTAURATION, new Map(fixture.production)),
    { historique: kek, active: null, lecture: [] },
  )
  expect(bilan.auth.membres_sans_compte).toBe(1)
  expect(bilan.erreurs).toContain('auth')
})

test('la copie refuse la production comme cible et n ecrase jamais un objet different', async () => {
  const source = stockageMemoire(PRODUCTION, fixture.production)
  await expect(
    copierStockage(source, stockageMemoire(PRODUCTION), { production: PRODUCTION }),
  ).rejects.toThrow('distinct de la production')
  await expect(copierStockage(source, stockageMemoire(RESTAURATION), {})).rejects.toThrow()
  const autre = Buffer.from('contenu different')
  const cible = stockageMemoire(RESTAURATION, new Map([[`pieces:${fixture.chemin}`, autre]]))
  const bilan = await copierStockage(source, cible, { production: PRODUCTION })
  expect(bilan.pieces.divergents).toBe(1)
  expect(await cible.lire('pieces', fixture.chemin)).toEqual(autre)
})

test('le client Storage parcourt les dossiers, ne suit pas les redirections et borne les chemins', async () => {
  const fichiers = new Map<string, Buffer>([['pieces/a/b', Buffer.from('octets')]])
  const vus: string[] = []
  const serveur = createServer(async (req, res) => {
    vus.push(
      `${req.method} ${req.url} ${req.headers.authorization === 'Bearer cle-de-service-fictive-123'}`,
    )
    const corps: Buffer[] = []
    for await (const bloc of req) corps.push(bloc as Buffer)
    const url = req.url ?? ''
    if (url.startsWith('/storage/v1/object/list/')) {
      const { prefix } = JSON.parse(Buffer.concat(corps).toString())
      res.setHeader('Content-Type', 'application/json')
      return res.end(
        JSON.stringify(prefix === '' ? [{ name: 'a', id: null }] : [{ name: 'b', id: 'x' }]),
      )
    }
    if (url.startsWith('/storage/v1/object/authenticated/')) {
      const o = fichiers.get(url.slice('/storage/v1/object/authenticated/'.length))
      res.statusCode = o ? 200 : 400
      return res.end(o ?? '{"statusCode":"404"}')
    }
    if (url === '/storage/v1/object/pieces/redirige') {
      res.writeHead(302, { Location: 'https://example.invalid/' })
      return res.end()
    }
    const cle = url.slice('/storage/v1/object/'.length)
    if (req.method === 'POST' && fichiers.has(cle)) {
      res.statusCode = 400
      return res.end('{"statusCode":"409"}')
    }
    fichiers.set(cle, Buffer.concat(corps))
    res.end('{}')
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  try {
    const { port } = serveur.address() as AddressInfo
    const client = stockageSupabase({
      projet: RESTAURATION,
      cle: 'cle-de-service-fictive-123',
      origine: `http://127.0.0.1:${port}`,
    })
    expect(await client.chemins('pieces')).toEqual(['a/b'])
    expect(await client.lire('pieces', 'a/b')).toEqual(Buffer.from('octets'))
    expect(await client.lire('pieces', 'absent')).toBeNull()
    expect(await client.deposer('pieces', 'a/b', Buffer.from('x'))).toBe('existe')
    expect(await client.deposer('pieces', 'a/c', Buffer.from('y'))).toBe('depose')
    await expect(client.deposer('pieces', 'redirige', Buffer.from('z'))).rejects.toThrow()
    await expect(client.lire('pieces', '../auth')).rejects.toThrow('Chemin Storage refuse')
    expect(vus.every((v) => v.endsWith('true'))).toBe(true)
  } finally {
    serveur.close()
  }
  expect(() => stockageSupabase({ projet: 'Production', cle: 'x'.repeat(30) })).toThrow()
})
