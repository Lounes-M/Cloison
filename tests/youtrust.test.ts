import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { creerVerificateurYoutrust } from '@/lib/signature/youtrust'

const id = '11111111-1111-4111-8111-111111111111'
const abonnement = '22222222-2222-4222-8222-222222222222'
const secret = 'secret-fictif-youtrust-sans-acces-32'
const config = { environnement: 'sandbox' as const, secret, abonnement }
const verifier = creerVerificateurYoutrust(config)
const objet = () => ({
  event_id: id,
  event_name: 'signature_request.done',
  event_time: String(Math.floor(Date.now() / 1000)),
  subscription_id: abonnement,
  sandbox: true,
  data: { signature_request: { id, status: 'done', signers: [{ email: 'prive@example.test' }] } },
})
const signer = (corps: Uint8Array, cle = secret) =>
  `sha256=${createHmac('sha256', cle).update(corps).digest('hex')}`
const encoder = (o: unknown) => Buffer.from(JSON.stringify(o, null, 2))

describe('Authentification Youtrust', () => {
  it.each([
    ['activated', 'ongoing'],
    ['activated', 'approval'],
    ['done', 'done'],
    ['expired', 'expired'],
    ['canceled', 'canceled'],
    ['declined', 'declined'],
    ['rejected', 'rejected'],
    ['deleted', 'deleted'],
    ['approved', 'ongoing'],
    ['reactivated', 'ongoing'],
  ])('authentifie %s/%s et minimise les donnees', (evenement, etat) => {
    const o = objet()
    o.event_name = `signature_request.${evenement}`
    o.data.signature_request.status = etat!
    const corps = encoder(o)
    expect(verifier(corps, signer(corps))).toEqual({
      evenement: id,
      transaction: id,
      etat,
      creeLe: Number(o.event_time),
    })
  })
  it('verifie les octets exacts et refuse une autre cle', () => {
    const corps = encoder(objet())
    expect(
      verifier(Buffer.from(corps.toString().replace('done', 'expired')), signer(corps)),
    ).toBeNull()
    expect(verifier(corps, signer(corps, secret + 'autre'))).toBeNull()
    expect(verifier(Buffer.from(JSON.stringify(objet())), signer(corps))).toBeNull()
  })
  it.each([null, '', 'sha256=ab', 'sha256=' + 'g'.repeat(64), 'sha512=' + 'a'.repeat(64)])(
    'refuse une signature malformee %#',
    (signature) => {
      expect(verifier(encoder(objet()), signature)).toBeNull()
    },
  )
  it.each([
    { sandbox: false },
    { subscription_id: id },
    { event_name: 'signer.done' },
    { event_name: 'toString' },
    { event_id: 'non-uuid' },
    { event_time: '-1' },
    { event_time: '1e9' },
    { event_time: String(Math.floor(Date.now() / 1000) + 1000) },
    { data: { signature_request: { id, status: 'ongoing' } } },
  ])('refuse un evenement incompatible meme signe %#', (modification) => {
    const corps = encoder({ ...objet(), ...modification })
    expect(verifier(corps, signer(corps))).toBeNull()
  })
  it('separe production et sandbox meme avec le meme secret', () => {
    const corps = encoder(objet())
    expect(
      creerVerificateurYoutrust({ ...config, environnement: 'production' })(corps, signer(corps)),
    ).toBeNull()
    const production = encoder({ ...objet(), sandbox: false })
    expect(
      creerVerificateurYoutrust({ ...config, environnement: 'production' })(
        production,
        signer(production),
      ),
    ).not.toBeNull()
  })
  it('accepte une nouvelle tentative ancienne sans simuler une deduplication persistante', () => {
    const corps = encoder({ ...objet(), event_time: '1700000000' })
    expect(verifier(corps, signer(corps))).not.toBeNull()
    expect(verifier(corps, signer(corps))).not.toBeNull()
  })
  it.each([Buffer.alloc(0), Buffer.alloc(65537), Buffer.from([0xff]), Buffer.from('{')])(
    'refuse taille et encodage invalides %#',
    (corps) => {
      expect(verifier(corps, signer(corps))).toBeNull()
    },
  )
  it('refuse la configuration incomplete sans donner les secrets', () => {
    expect(() => creerVerificateurYoutrust({ ...config, secret: '' })).toThrow(
      'Authentification Youtrust indisponible',
    )
  })
})
