import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'

function decoderHtml(texte) {
  return texte.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt);/gi, (_entite, nom) => {
    if (nom[0] === '#') {
      const hex = nom[1].toLowerCase() === 'x'
      return String.fromCodePoint(parseInt(nom.slice(hex ? 2 : 1), hex ? 16 : 10))
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[nom.toLowerCase()]
  })
}
function attributs(balise) {
  const resultat = {}
  for (const match of balise.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    resultat[match[1].toLowerCase()] = decoderHtml(match[2] ?? match[3])
  }
  return resultat
}

/** Parseur volontairement borne aux formulaires SSR natifs emis par React. */
export function formulaireReact(html, champ, valeur) {
  assert.equal(typeof html, 'string')
  assert(html.length <= 4 * 1024 * 1024, 'HTML trop volumineux')
  const candidats = []
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const entete = attributs(match[1])
    const caches = [...match[2].matchAll(/<input\b[^>]*>/gi)]
      .map((entree) => attributs(entree[0]))
      .filter((entree) => entree.type?.toLowerCase() === 'hidden' && entree.name)
    if (!caches.some((entree) => entree.name === champ && entree.value === valeur)) continue
    assert.equal(entete.method?.toLowerCase(), 'post', 'Formulaire non POST refuse')
    assert.equal(entete.enctype?.toLowerCase(), 'multipart/form-data', 'Encodage inattendu')
    assert(
      caches.some((entree) => /^\$ACTION_(REF|ID)_/.test(entree.name)),
      'Action React absente',
    )
    candidats.push({ action: entete.action ?? '', caches })
  }
  assert.equal(candidats.length, 1, 'Formulaire cible absent ou ambigu')
  return candidats[0]
}

/**
 * Le caller cree et nettoie SA fixture par son canal autorise.
 * lireFixture() rend {id,demonstration,emailLocataire,emailGarant,pieces:[{id,chemin}],
 * journal:[{action,pieceId}],objetsEnFile:[chemin]}. Aucune cle serveur ici.
 * Le jeton de capacite reste en memoire, jamais imprime ni retourne.
 */
export async function essayerCoffreHttp({ origine, dossierId, jetonGarant, lireFixture }) {
  const site = new URL(origine)
  assert(
    (site.protocol === 'https:' && site.hostname === 'www.cloison.immo' && !site.port) ||
      (site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname)),
    'Origine non autorisee pour cet essai',
  )
  assert.equal(site.pathname, '/')
  assert(!site.search && !site.hash && !site.username && !site.password)
  assert.match(dossierId, /^[0-9a-f-]{36}$/)
  assert.equal(typeof jetonGarant, 'string')
  assert.equal(jetonGarant.split('.').length, 3)
  // Ce controle ne remplace pas la signature cote Next ; il empeche surtout
  // une erreur d'operateur de deposer dans un autre dossier avec le mauvais lien.
  const claims = JSON.parse(Buffer.from(jetonGarant.split('.')[1], 'base64url').toString('utf8'))
  assert.equal(claims.dossier_id, dossierId)
  assert.equal(claims.role_partie, 'garant')
  assert.equal(claims.role, 'porteur_lien')
  const constater = async () => {
    const fixture = await lireFixture()
    assert.equal(fixture.id, dossierId, 'Fixture inattendue')
    assert.equal(fixture.demonstration, true, 'Dossier de demonstration obligatoire')
    assert.match(fixture.emailLocataire, /@[^@\s]+\.invalid$/)
    assert.match(fixture.emailGarant, /@[^@\s]+\.invalid$/)
    return fixture
  }
  const initial = await constater()
  assert.equal(initial.pieces.length, 0, 'Fixture vide obligatoire')
  let cookie
  const requeter = async (chemin, body) => {
    const cible = new URL(chemin, site)
    assert.equal(cible.origin, site.origin, 'Redirection externe refusee')
    const reponse = await fetch(cible, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { Origin: site.origin } : {}),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    })
    return reponse
  }
  const connexion = await requeter(`/lien/${jetonGarant}`)
  assert.equal(connexion.status, 307, 'Lien garant refuse')
  assert.equal(new URL(connexion.headers.get('location'), site).pathname, '/garant')
  const cookieComplet = connexion.headers.get('set-cookie')
  assert.match(cookieComplet, /HttpOnly/i)
  assert.match(cookieComplet, /^cloison_capacite=/)
  cookie = cookieComplet.split(';')[0]
  const lirePage = async () => {
    const reponse = await requeter('/garant')
    assert.equal(reponse.status, 200, 'Espace garant indisponible')
    return reponse.text()
  }
  const poster = async (formulaire, fichier) => {
    const cible = new URL(formulaire.action || '/garant', site)
    assert.equal(cible.origin, site.origin)
    assert.equal(cible.pathname, '/garant', 'Action hors espace garant refusee')
    const body = new FormData()
    for (const entree of formulaire.caches) body.append(entree.name, entree.value ?? '')
    if (fichier)
      body.append('fichier', new Blob([fichier], { type: 'application/pdf' }), 'essai-fictif.pdf')
    const reponse = await requeter(cible, body)
    assert([200, 303].includes(reponse.status), `Action HTTP refusee : ${reponse.status}`)
    // Consommer le corps pour terminer le rendu. Le succes metier est verifie
    // par le canal SQL du caller, jamais deduit d'un simple HTTP 200.
    await reponse.arrayBuffer()
    if (reponse.status === 303) {
      const retour = new URL(reponse.headers.get('location'), site)
      assert.equal(retour.origin, site.origin)
      assert.equal(retour.pathname, '/garant')
    }
  }
  const pdf = await PDFDocument.create()
  const police = await pdf.embedFont(StandardFonts.Helvetica)
  pdf
    .addPage([300, 180])
    .drawText('CLOISON - ESSAI HTTP FICTIF', { x: 20, y: 100, size: 14, font: police })
  const document = Buffer.from(await pdf.save())
  assert(document.length < 32 * 1024)
  const depot = formulaireReact(await lirePage(), 'nature', 'bulletin_paie')
  await poster(depot, document)
  const depose = await constater()
  assert.equal(depose.pieces.length, 1, 'Le depot Next ne laisse pas exactement une piece')
  const piece = depose.pieces[0]
  assert.match(piece.id, /^[0-9a-f-]{36}$/)
  assert(piece.chemin.startsWith(`${dossierId}/`))
  const original = await requeter(`/garant/pieces/${piece.id}`)
  assert.equal(original.status, 200, 'Original indisponible apres depot')
  assert.match(original.headers.get('content-type'), /application\/pdf/i)
  assert.match(original.headers.get('content-disposition'), /^attachment;/i)
  assert.match(original.headers.get('cache-control'), /no-store/i)
  assert.equal(original.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(
    Buffer.from(await original.arrayBuffer()),
    document,
    'Original restitue different',
  )
  const consulte = await constater()
  assert(
    consulte.journal.some((j) => j.action === 'piece_ouverte' && j.pieceId === piece.id),
    'Lecture non journalisee',
  )
  await poster(formulaireReact(await lirePage(), 'piece', piece.id))
  const retire = await constater()
  assert.equal(retire.pieces.length, 0, 'Retrait Next non effectif')
  assert(retire.objetsEnFile.includes(piece.chemin), 'Retrait absent de la file durable')
  assert(
    retire.journal.some((j) => j.action === 'piece_retiree' && j.pieceId === piece.id),
    'Retrait non journalise',
  )
  const absent = await requeter(`/garant/pieces/${piece.id}`)
  assert.equal(absent.status, 404, 'Original encore servi apres retrait')
  return {
    nature: 'HTTP natif Next, sans navigateur ni hydratation',
    preuve: 'depot, restitution exacte et journalisee, retrait et file durable',
    sha256Fictif: createHash('sha256').update(document).digest('hex'),
    cheminANettoyer: piece.chemin,
  }
}
