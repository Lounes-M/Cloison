import { NextResponse } from 'next/server'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { lireOriginalGarant } from '@/lib/garant/original'

export const runtime = 'nodejs'

/** L'original est telecharge, jamais execute dans l'origine du site. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const porteur = await capaciteDepuisCookies()
  if (!porteur || porteur.capacite.partie !== 'garant')
    return new NextResponse(null, { status: 404 })
  const db = clientPorteurDeLien(porteur.jeton)
  try {
    const original = await lireOriginalGarant(db, porteur.capacite, id)
    if (!original) return new NextResponse(null, { status: 404 })
    const extension =
      original.typeReel === 'application/pdf'
        ? 'pdf'
        : original.typeReel === 'image/png'
          ? 'png'
          : 'jpg'
    return new NextResponse(new Uint8Array(original.contenu), {
      headers: {
        'Content-Type': original.typeReel,
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
