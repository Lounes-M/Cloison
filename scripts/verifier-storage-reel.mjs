import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { nouvelleCle, ouvrir, sceller } from '../lib/coffre/enveloppe.ts'

// Essai explicite, avec fixture isolee et nettoyage. Aucun document de personne.
// Le jeton Management arrive par stdin et ne figure ni dans argv ni sur disque.
if (process.argv.length !== 3 || process.argv[2] !== '--fixture-fictive')
  throw new Error('Option --fixture-fictive requise')
const projet = process.env.SUPABASE_PROJECT_REF
assert.match(projet ?? '', /^[a-z]{20}$/)
let entree = ''
for await (const bloc of process.stdin) {
  entree += bloc
  if (entree.length > 8192) throw new Error('Entree trop longue')
}
const acces = entree.trim()
assert.ok(acces)
const origine = `https://${projet}.supabase.co`
async function management(chemin, corps) {
  const reponse = await fetch(`https://api.supabase.com/v1/projects/${projet}/${chemin}`, {
    method: corps ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!reponse.ok) throw new Error(`Management refuse : HTTP ${reponse.status}`)
  return reponse.json()
}
const sql = (query) => management('database/query', { query, read_only: false })
const [{ jwt_secret: secret }, cles] = await Promise.all([
  management('postgrest'),
  management('api-keys'),
])
const publique = cles.find((c) => c.name === 'anon')?.api_key
assert.ok(publique && secret)
function jeton(role, claims = {}) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const corps = `${b64({ alg: 'HS256' })}.${b64({ role, ...claims, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })}`
  return `${corps}.${createHmac('sha256', secret).update(corps).digest('base64url')}`
}
async function api(chemin, bearer, method = 'GET', body) {
  return fetch(`${origine}${chemin}`, {
    method,
    headers: {
      apikey: publique,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
}
const id = randomUUID(),
  autre = randomUUID(),
  jti = randomUUID(),
  chemin = `${id}/${randomUUID()}`
const claims = { dossier_id: id, role_partie: 'garant', jti }
const garant = jeton('porteur_lien', claims),
  depot = jeton('depot_piece', claims)
const serveur = jeton('serveur')
const document = Buffer.from('CLOISON : exercice Storage fictif, sans donnee personnelle.')
const cle = nouvelleCle(),
  chiffre = sceller(document, cle)
let cree = false
const preuve = (nom) => console.log(`OK : ${nom}`)
async function verifierRefus(reponse, nom) {
  assert.ok(
    [400, 401, 403, 404].includes(reponse.status),
    `Refus ${nom} : HTTP inattendu ${reponse.status}`,
  )
  const erreur = await reponse.json()
  assert.equal(
    Number(erreur.statusCode),
    nom.startsWith('lecture ') ? 404 : 403,
    `Refus ${nom} : code Storage inattendu`,
  )
  preuve(`${nom} refuse, HTTP ${reponse.status}, Storage ${erreur.statusCode}`)
}
try {
  cree = true
  await sql(
    `begin; insert into public.dossiers(id,email_locataire,email_garant,demonstration) values ('${id}','stockage@example.invalid','garant@example.invalid',true),('${autre}','stockage@example.invalid','garant@example.invalid',true); insert into public.jetons_actifs(dossier_id,partie,jti,expire_le) values ('${id}','garant','${jti}',now()+interval '15 minutes'),('${id}','locataire','${jti}',now()+interval '15 minutes'),('${autre}','garant','${jti}',now()+interval '15 minutes'); commit;`,
  )
  cree = true
  for (const [nom, role] of [
    ['anonyme', publique],
    ['garant direct', garant],
  ]) {
    const refus = await api(`/storage/v1/object/pieces/${chemin}`, role, 'POST', chiffre)
    await verifierRefus(refus, `depot ${nom}`)
  }
  const upload = await api(`/storage/v1/object/pieces/${chemin}`, depot, 'POST', chiffre)
  assert.ok(upload.ok, `Depot serveur refuse HTTP ${upload.status}`)
  const lecture = await api(`/storage/v1/object/authenticated/pieces/${chemin}`, garant)
  assert.equal(lecture.status, 200)
  const recu = Buffer.from(await lecture.arrayBuffer())
  assert.deepEqual(recu, chiffre)
  assert.deepEqual(ouvrir(recu, cle), document)
  preuve('octets chiffres televerses, relus et dechiffres a empreinte identique')
  for (const [nom, role] of [
    ['anonyme', publique],
    ['locataire', jeton('porteur_lien', { ...claims, role_partie: 'locataire' })],
    ['autre dossier', jeton('porteur_lien', { ...claims, dossier_id: autre })],
    ['jeton revoque', jeton('porteur_lien', { ...claims, jti: randomUUID() })],
  ]) {
    const refus = await api(`/storage/v1/object/authenticated/pieces/${chemin}`, role)
    await verifierRefus(refus, `lecture ${nom}`)
  }
  assert.equal((await api(`/storage/v1/object/authenticated/pieces/${chemin}`, garant)).status, 200)
  for (const [nom, role] of [
    ['garant', garant],
    ['depot', depot],
  ]) {
    await verifierRefus(
      await api('/storage/v1/object/pieces', role, 'DELETE', { prefixes: [chemin] }),
      `suppression directe ${nom}`,
    )
  }
  const sansFile = await api('/storage/v1/object/pieces', serveur, 'DELETE', { prefixes: [chemin] })
  assert.ok(sansFile.ok)
  assert.deepEqual(await sansFile.json(), [])
  preuve('serveur ne supprime pas un objet hors file')
  await sql(
    `update public.dossiers set cree_le=now()-interval '4 months',expire_le=now()-interval '1 day' where id='${id}';`,
  )
  await verifierRefus(
    await api(
      `/storage/v1/object/authenticated/pieces/${chemin}?cacheNonce=${randomUUID()}`,
      garant,
    ),
    'lecture origine apres expiration',
  )
  // Mise en file ciblee : ne jamais appeler la purge globale depuis un essai.
  await sql(
    `insert into public.objets_a_supprimer(chemin) values ('${chemin}') on conflict do nothing;`,
  )
  const file = await sql(`select chemin from public.objets_a_supprimer where chemin='${chemin}'`)
  assert.equal(file.length, 1)
  const suppression = await api('/storage/v1/object/pieces', serveur, 'DELETE', {
    prefixes: [chemin],
  })
  assert.ok(suppression.ok, `Suppression refusee HTTP ${suppression.status}`)
  const apres = await sql(
    `select count(*)::int as n from storage.objects where bucket_id='pieces' and name='${chemin}'`,
  )
  assert.equal(apres[0].n, 0)
  preuve('expiration fixture puis suppression API Storage ciblee et absence des metadonnees')
  const apresSuppression = await api(`/storage/v1/object/authenticated/pieces/${chemin}`, garant)
  console.log(
    'Cache apres suppression :',
    apresSuppression.status,
    apresSuppression.headers.get('cf-cache-status'),
    apresSuppression.headers.get('cache-control'),
    apresSuppression.headers.get('age'),
  )
  await verifierRefus(
    await api(
      `/storage/v1/object/authenticated/pieces/${chemin}?cacheNonce=${randomUUID()}`,
      garant,
    ),
    'lecture origine apres suppression',
  )
} finally {
  if (cree) {
    // Si le test a echoue apres upload, conserver la file tant que les octets existent.
    await sql(
      `insert into public.objets_a_supprimer(chemin) values ('${chemin}') on conflict do nothing;`,
    )
    const retrait = await api('/storage/v1/object/pieces', serveur, 'DELETE', {
      prefixes: [chemin],
    })
    if (!retrait.ok) throw new Error('Nettoyage Storage incomplet : objet conserve en file')
    const reste = await sql(
      `select count(*)::int as n from storage.objects where bucket_id='pieces' and name='${chemin}'`,
    )
    assert.equal(reste[0].n, 0, 'Nettoyage incomplet, file conservee')
    await sql(
      `begin; delete from public.objets_a_supprimer where chemin='${chemin}'; delete from public.dossiers where id in ('${id}','${autre}') and demonstration=true and email_locataire='stockage@example.invalid' and email_garant='garant@example.invalid'; commit;`,
    )
    const residus = await sql(
      `select (select count(*) from public.dossiers where id in ('${id}','${autre}')) + (select count(*) from public.objets_a_supprimer where chemin='${chemin}') as n`,
    )
    assert.equal(Number(residus[0].n), 0, 'Fixture non nettoyee')
    preuve('fixture et objet nettoyes')
  }
}
