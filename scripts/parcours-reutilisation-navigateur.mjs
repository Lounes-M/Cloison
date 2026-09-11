import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { SignJWT, decodeJwt } from 'jose'
import { PDFDocument } from 'pdf-lib'
const source = '33333333-3333-4333-8333-333333333333',
  piece = '44444444-4444-4444-8444-444444444444',
  copieId = '55555555-5555-4555-8555-555555555555'
function sceller(octets, cle) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', cle, iv),
    b = Buffer.concat([c.update(octets), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), b])
}
function ouvrir(octets, cle) {
  const d = createDecipheriv('aes-256-gcm', cle, octets.subarray(0, 12))
  d.setAuthTag(octets.subarray(12, 28))
  return Buffer.concat([d.update(octets.subarray(28)), d.final()])
}
export async function fixtureReutilisation(cible) {
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('Piece fictive de verification')
  const clair = Buffer.from(await pdf.save()),
    cleSource = Buffer.alloc(32, 9)
  const sourceChiffre = sceller(clair, cleSource),
    cleScellee = '\\x' + sceller(cleSource, Buffer.alloc(32, 7)).toString('hex')
  let active = false,
    copie = null,
    objet = null,
    depots = 0
  const jeton = await new SignJWT({
    role: 'porteur_lien',
    dossier_id: source,
    role_partie: 'garant',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(source)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('fixture'))
  const meta = {
    id: piece,
    dossier_id: source,
    type: 'piece_identite',
    type_reel: 'application/pdf',
    taille_octets: clair.length,
    nombre_documents: 1,
    depose_le: '2026-09-10T12:00:00Z',
    chemin: source + '/' + piece,
  }
  return {
    lien: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000') + '/lien/' + jeton,
    activer() {
      active = true
      copie = null
      objet = null
      depots = 0
    },
    arreter() {
      active = false
    },
    depots: () => depots,
    traiter(req, res, raw) {
      if (!active) return false
      const url = new URL(req.url, 'http://localhost'),
        path = url.pathname
      const claims = decodeJwt(req.headers.authorization.replace('Bearer ', ''))
      let valeur
      if (path.startsWith('/storage/v1/object/')) {
        if (req.method === 'GET') {
          assert.equal(claims.dossier_id, source)
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(sourceChiffre)
          return true
        }
        assert.equal(claims.role, 'depot_piece')
        assert.equal(claims.dossier_id, cible)
        assert.equal(claims.copie_piece, piece)
        objet = Buffer.from(raw)
        assert.deepEqual(ouvrir(objet, Buffer.alloc(32, 8)), clair)
        assert.notDeepEqual(objet, sourceChiffre)
        depots++
        valeur = { Key: 'pieces/' + cible + '/' + copieId }
      } else if (path.endsWith('/rpc/consommer_debit')) valeur = true
      else if (path.endsWith('/rpc/reserver_depot')) valeur = null
      else if (path.endsWith('/provenances_pieces'))
        valeur = copie
          ? [
              {
                piece_id: copieId,
                empreinte_original: createHash('sha256').update(clair).digest('hex'),
              },
            ]
          : []
      else if (
        path.endsWith('/cles_dossier') &&
        url.searchParams.get('dossier_id') === 'eq.' + source
      )
        valeur = [{ cle_scellee: cleScellee }]
      else if (path.endsWith('/pieces')) {
        if (req.method === 'POST') {
          assert(objet)
          assert.equal(claims.copie_version, 'copie-v1')
          const b = JSON.parse(raw.toString())
          assert.equal(b.dossier_id, cible)
          copie = { ...b, id: copieId, depose_le: new Date().toISOString() }
          valeur = { id: copieId }
        } else
          valeur =
            url.searchParams.get('dossier_id') === 'eq.' + source ? [meta] : copie ? [copie] : []
      } else return false
      res.setHeader('Content-Type', 'application/json')
      if (req.headers.accept?.includes('vnd.pgrst.object') && Array.isArray(valeur))
        valeur = valeur[0] ?? null
      res.end(JSON.stringify(valeur))
      return true
    },
  }
}
export async function parcourirReutilisation(page, site, moteur, largeur, fixture) {
  fixture.activer()
  try {
    await page.goto(site + '/garant')
    const bloc = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: 'Réutiliser une de tes pièces', exact: true }),
      })
      .last()
    await bloc
      .getByLabel('Ton lien garant du dossier source')
      .fill('https://tiers.invalid/lien/aaa.bbb.ccc')
    await bloc.getByRole('button', { name: 'Afficher les pièces disponibles' }).click()
    await bloc.getByRole('alert').filter({ hasText: 'Ce lien ne permet pas' }).waitFor()
    await bloc.getByLabel('Ton lien garant du dossier source').fill(fixture.lien)
    await bloc.getByRole('button', { name: 'Afficher les pièces disponibles' }).click()
    await bloc.getByLabel('Pièce à copier', { exact: true }).selectOption(piece)
    await bloc.getByRole('button', { name: 'Copier cette pièce' }).click()
    assert.equal(fixture.depots(), 0, 'Aucun octet copie sans consentement')
    await bloc.getByRole('checkbox').check()
    await bloc.getByRole('button', { name: 'Copier cette pièce' }).focus()
    await page.keyboard.press('Enter')
    await bloc.getByRole('status').filter({ hasText: 'La copie est confirmée' }).waitFor()
    assert.equal(fixture.depots(), 1)
    await page.reload()
    await bloc.getByLabel('Ton lien garant du dossier source').fill(fixture.lien)
    await bloc.getByRole('button', { name: 'Afficher les pièces disponibles' }).click()
    await bloc.getByLabel('Pièce à copier', { exact: true }).selectOption(piece)
    await bloc.getByRole('checkbox').check()
    await bloc.getByRole('button', { name: 'Copier cette pièce' }).click()
    await bloc.getByRole('status').filter({ hasText: 'La copie est confirmée' }).waitFor()
    assert.equal(fixture.depots(), 1, 'Le rejeu ne cree pas de doublon')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    console.log(
      `OK : reutilisation ${moteur.name()} ${largeur}, lien externe refuse, accord, rechiffrement, clavier et rejeu`,
    )
  } finally {
    fixture.arreter()
  }
}
