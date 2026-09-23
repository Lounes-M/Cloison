import 'server-only'
import { contexteAgence } from '@/lib/agences/contexte'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { dossierActe } from './parcours-types'
import { ouvrirContexteActe } from './parcours'
import { ouvrirFichierActe } from './archive-format'
import { stockageActe } from './stockage-actes'
import { fluxArchive } from './flux-archive'
import { z } from 'zod'

export async function accesActe(id: string, partie: 'agence' | 'garant') {
  z.uuid().parse(id)
  let db
  let dossier: string | undefined
  if (partie === 'agence') {
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee')
      throw new Error('Acte indisponible')
    db = c.supabase
  } else {
    const p = await capaciteDepuisCookies()
    if (!p || p.capacite.partie !== 'garant') throw new Error('Acte indisponible')
    db = clientPorteurDeLien(p.jeton)
    dossier = p.capacite.dossierId
  }
  const r = await db.rpc('lire_acte_signature', { le_id: id })
  if (r.error) throw new Error('Acte indisponible')
  const d = dossierActe.parse(r.data)
  if (d.acte.id !== id) throw new Error('Acte indisponible')
  return {
    db,
    d,
    dossier,
    operationEnCours: Date.parse(d.acte.operation_jusqu_au ?? '') > Date.now(),
  }
}

export async function telechargerActe(
  requete: Request,
  id: string,
  nature: string,
  partie: 'agence' | 'garant',
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Referrer-Policy': 'no-referrer',
  }
  let cle: Buffer | undefined
  let contenu: Buffer | undefined
  try {
    const type = z.enum(['projet', 'acte', 'preuve']).parse(nature)
    const { db, d } = await accesActe(id, partie)
    if (type !== 'projet' && d.acte.etape !== 'archive') throw new Error()
    const f = d.fichiers.find((f) => f.nature === type && f.confirme)
    if (!f) throw new Error()
    const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(45000)])
    cle = ouvrirContexteActe(d).cle
    const pdf = ouvrirFichierActe(await (await stockageActe(f, signal)).lire(), cle, f)
    contenu = pdf
    signal.throwIfAborted()
    const j = await db.rpc('journaliser_lecture_acte', { le_id: id })
    if (j.error || j.data !== true) {
      pdf.fill(0)
      throw new Error()
    }
    signal.throwIfAborted()
    // La verification GCM et la derniere autorisation precedent le premier octet.
    // Le flux conserve l'original signe et evite la limite des reponses bufferisees.
    const flux = fluxArchive(pdf, signal)
    return new Response(flux, {
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cloison-${type}.pdf"`,
      },
    })
  } catch {
    contenu?.fill(0)
    return new Response(null, { status: 404, headers })
  } finally {
    cle?.fill(0)
  }
}
