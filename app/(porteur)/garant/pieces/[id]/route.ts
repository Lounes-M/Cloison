import { NextResponse } from 'next/server'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { SEAU, inscrireAuJournal, lireCleScellee } from '@/lib/coffre/depot-supabase'
import { ouvrir } from '@/lib/coffre/enveloppe'
import { cleMaitresse } from '@/lib/coffre/cle-maitresse'

export const runtime = 'nodejs'

/** L'original est telecharge, jamais execute dans l'origine du site. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const porteur = await capaciteDepuisCookies()
  if (!porteur || porteur.capacite.partie !== 'garant')
    return new NextResponse(null, { status: 404 })
  const db = clientPorteurDeLien(porteur.jeton)
  const { data: piece, error } = await db
    .from('pieces')
    .select('dossier_id,chemin,type_reel')
    .eq('id', id)
    .eq('dossier_id', porteur.capacite.dossierId)
    .maybeSingle()
  if (error || !piece) return new NextResponse(null, { status: 404 })
  if (!(await inscrireAuJournal(db, piece.dossier_id, 'piece_ouverte', id)))
    return new NextResponse(null, { status: 503 })
  try {
    const cle = await lireCleScellee(db, piece.dossier_id)
    const { data, error: storage } = await db.storage.from(SEAU).download(piece.chemin)
    if (!cle || !data || storage) return new NextResponse(null, { status: 404 })
    const contenu = ouvrir(Buffer.from(await data.arrayBuffer()), ouvrir(cle, cleMaitresse()))
    const extension =
      piece.type_reel === 'application/pdf'
        ? 'pdf'
        : piece.type_reel === 'image/png'
          ? 'png'
          : 'jpg'
    return new NextResponse(new Uint8Array(contenu), {
      headers: {
        'Content-Type': piece.type_reel,
        'Content-Disposition': `attachment; filename="original.${extension}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    })
  } catch {
    return new NextResponse(null, { status: 503 })
  }
}
