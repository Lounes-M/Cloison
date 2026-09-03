import { SignJWT } from 'jose'
import { beforeAll, describe, expect, test } from 'vitest'

/**
 * La signature du jeton, hors base.
 *
 * Ces tests ne verifient pas la revocation, qui vit dans `jetons.test.ts` :
 * ils verifient qu'un jeton mal forme, mal signe, expire ou fabrique avec un
 * autre algorithme est refuse. Les deux controles sont necessaires et aucun ne
 * suffit.
 *
 * Le secret est pose ici : ce module lit `SUPABASE_JWT_SECRET`, et un test qui
 * dependrait du secret de production serait un test qu'on ne peut pas jouer.
 */

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789'
const DOSSIER = '11111111-2222-3333-4444-555555555555'

/**
 * Import differe, et volontairement.
 *
 * `lib/acces/jeton` lit le secret au premier appel : il faut donc l'avoir pose
 * avant que le module soit charge. Un import statique en tete de fichier ferait
 * dependre le test du secret de production, donc d'un secret qu'on n'a pas.
 */
type ModuleJeton = Awaited<ReturnType<typeof chargerModule>>
const chargerModule = () => import('@/lib/acces/jeton')

let jeton: ModuleJeton

beforeAll(async () => {
  process.env.SUPABASE_JWT_SECRET = SECRET
  jeton = await chargerModule()
})

const signerJeton: ModuleJeton['signerJeton'] = (...args) => jeton.signerJeton(...args)
const verifierSignature: ModuleJeton['verifierSignature'] = (...args) =>
  jeton.verifierSignature(...args)

const dansUneHeure = () => new Date(Date.now() + 3_600_000)

describe('signature du jeton', () => {
  test('un jeton emis par nous se relit', async () => {
    const jeton = await signerJeton(DOSSIER, 'garant', crypto.randomUUID(), dansUneHeure())
    const capacite = await verifierSignature(jeton)

    expect(capacite?.dossierId).toBe(DOSSIER)
    expect(capacite?.partie).toBe('garant')
  })

  test('une signature faite avec un autre secret est refusee', async () => {
    const autre = new TextEncoder().encode('un-autre-secret-tout-aussi-long-0123456789')
    const jeton = await new SignJWT({
      role: 'porteur_lien',
      dossier_id: DOSSIER,
      role_partie: 'garant',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(crypto.randomUUID())
      .setExpirationTime('1h')
      .sign(autre)

    expect(await verifierSignature(jeton)).toBeNull()
  })

  test('un jeton modifie apres coup est refuse', async () => {
    const jeton = await signerJeton(DOSSIER, 'locataire', crypto.randomUUID(), dansUneHeure())
    const [entete, charge, signature] = jeton.split('.')

    // On repasse le locataire en garant dans la charge utile, sans toucher a la
    // signature : c'est exactement l'attaque que la signature doit arreter.
    const modifiee = JSON.parse(Buffer.from(charge!, 'base64url').toString())
    modifiee.role_partie = 'garant'
    const falsifiee = Buffer.from(JSON.stringify(modifiee)).toString('base64url')

    expect(await verifierSignature(`${entete}.${falsifiee}.${signature}`)).toBeNull()
  })

  test('un jeton expire est refuse', async () => {
    const jeton = await signerJeton(
      DOSSIER,
      'garant',
      crypto.randomUUID(),
      new Date(Date.now() - 60_000),
    )
    expect(await verifierSignature(jeton)).toBeNull()
  })

  test('un jeton sans le role Postgres attendu est refuse', async () => {
    const jeton = await new SignJWT({
      role: 'authenticated',
      dossier_id: DOSSIER,
      role_partie: 'garant',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(crypto.randomUUID())
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))

    // Un jeton correctement signe mais qui reclamerait le role de l'agence :
    // refuse ici, avant meme que Postgres ait a se prononcer.
    expect(await verifierSignature(jeton)).toBeNull()
  })

  test('une partie inventee est refusee', async () => {
    const jeton = await new SignJWT({
      role: 'porteur_lien',
      dossier_id: DOSSIER,
      role_partie: 'agence',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(crypto.randomUUID())
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))

    expect(await verifierSignature(jeton)).toBeNull()
  })

  test('un jeton sans algorithme est refuse', async () => {
    // La confusion d'algorithme, faille classique de JWT : un jeton qui se
    // declare `alg: none` et arrive sans signature.
    //
    // Ce test ne prouve pas que notre contrainte `algorithms` sert : verifie
    // en la retirant, `jose` refuse deja seul. Il garde la propriete, pas son
    // mecanisme, ce qui est le bon niveau : si la bibliotheque changeait, il
    // continuerait de dire la verite.
    const entete = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const charge = Buffer.from(
      JSON.stringify({
        role: 'porteur_lien',
        dossier_id: DOSSIER,
        role_partie: 'garant',
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url')

    expect(await verifierSignature(`${entete}.${charge}.`)).toBeNull()
  })

  test('n importe quelle chaine est refusee sans lever', async () => {
    for (const entree of ['', 'pas-un-jeton', 'a.b.c', '...']) {
      expect(await verifierSignature(entree)).toBeNull()
    }
  })
})
