import { createHash } from 'node:crypto'
import { z } from 'zod'
import { decisionCollecte, verifierSuiviCollecte, type BaseCollecte } from './collecte.ts'
import { ouvrir } from '../coffre/enveloppe.ts'
import { ouvrirAvecTrousseau, type Trousseau } from '../coffre/rotation-format.ts'
import { typeReel } from '../coffre/type-reel.ts'

const maximum = 64 * 1024 * 1024
const schema = z.strictObject({
  id: z.uuid(),
  dossier_id: z.uuid(),
  chemin: z.string().max(256),
  taille_octets: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
  type_reel: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
  cle: z.string().regex(/^[a-f0-9]{120,256}$/),
})
const empreinte = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const refuser = (): never => {
  throw new Error('Collecte des pieces refusee.')
}

/** Lecture fraiche, sans conserver une transaction pendant les appels Storage. */
export async function lireSelectionPieces(db: BaseCollecte, brut: string) {
  const { decision: d } = decisionCollecte(brut)
  if (!d.pieces?.length) return refuser()
  await verifierSuiviCollecte(db, brut)
  const { rows } = await db.query(
    `
    with selection as (
      select * from unnest($1::uuid[], $2::uuid[]) with ordinality as s(id,dossier,ordre)
    ) select p.id,p.dossier_id,p.chemin,p.taille_octets,p.type_reel,
      encode(c.cle_scellee,'hex') cle
    from selection s join public.pieces p on p.id=s.id and p.dossier_id=s.dossier
    join public.dossiers d on d.id=p.dossier_id
    join public.cles_dossier c on c.dossier_id=d.id
    where lower(d.email_garant)=lower($3) and d.coffre_purge_le is null
    order by s.ordre`,
    [d.pieces.map((p) => p.id), d.pieces.map((p) => p.dossier), d.destinataire.email],
  )
  if (rows.length !== d.pieces.length) return refuser()
  const pieces = rows.map((r, i) => {
    const p = schema.parse(r),
      attendu = d.pieces![i]!
    const segments = p.chemin.split('/')
    if (
      p.id !== attendu.id ||
      p.dossier_id !== attendu.dossier ||
      segments.length !== 2 ||
      segments[0] !== p.dossier_id ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(segments[1]!)
    )
      return refuser()
    return p
  })
  if (pieces.reduce((n, p) => n + p.taille_octets, 0) > maximum) return refuser()
  await verifierSuiviCollecte(db, brut)
  return pieces
}

/** Copies originales de travail. Aucun moteur documentaire ni remise automatique. */
export async function collecterPiecesDroits(
  db: BaseCollecte,
  brut: string,
  trousseau: Trousseau,
  telecharger: (chemin: string, taille: number, signal: AbortSignal) => Promise<Buffer>,
) {
  const fichiers = new Map<string, Buffer>()
  try {
    const { decision: d, empreinte: decisionSha256 } = decisionCollecte(brut)
    const selection = await lireSelectionPieces(db, brut)
    const signature = empreinte(JSON.stringify(selection))
    const signal = AbortSignal.timeout(120000)
    const verifier = async () => {
      signal.throwIfAborted()
      if (empreinte(JSON.stringify(await lireSelectionPieces(db, brut))) !== signature) refuser()
      signal.throwIfAborted()
    }
    const inventaire = []
    for (const [i, p] of selection.entries()) {
      await verifier()
      let cle: Buffer | undefined, chiffre: Buffer | undefined, contenu: Buffer | undefined
      try {
        chiffre = await telecharger(p.chemin, p.taille_octets + 28, signal)
        signal.throwIfAborted()
        if (!Buffer.isBuffer(chiffre) || chiffre.length !== p.taille_octets + 28) refuser()
        cle = ouvrirAvecTrousseau(Buffer.from(p.cle, 'hex'), trousseau)
        contenu = ouvrir(chiffre, cle)
        const type = typeReel(contenu)
        if (contenu.length !== p.taille_octets || !type.accepte || type.type !== p.type_reel)
          refuser()
        await verifier()
        const extension =
          p.type_reel === 'application/pdf' ? 'pdf' : p.type_reel === 'image/png' ? 'png' : 'jpg'
        const nom = `piece-${String(i + 1).padStart(4, '0')}.${extension}`
        inventaire.push({
          nom,
          id: p.id,
          dossier: p.dossier_id,
          taille: contenu.length,
          sha256: empreinte(contenu),
        })
        fichiers.set(nom, contenu)
        contenu = undefined // Le proprietaire de la Map effacera le tampon apres ecriture.
      } finally {
        cle?.fill(0)
        chiffre?.fill(0)
        contenu?.fill(0)
      }
    }
    await verifier()
    return {
      fichiers,
      verifier,
      manifeste: {
        version: 1,
        usage: 'copies_originales_a_relire',
        remiseAutorisee: false,
        inventaireComplet: false,
        demande: d.demande,
        revision: d.revision,
        decisionSha256,
        destinataireReference: d.destinataire.reference,
        expireLe: d.expireLe,
        fichiers: inventaire,
      },
    }
  } catch {
    for (const b of fichiers.values()) b.fill(0)
    return refuser()
  }
}
