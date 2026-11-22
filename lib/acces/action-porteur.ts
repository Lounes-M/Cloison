'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { lien } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

/** Quitte ce navigateur. La reemission du lien reste la revocation distante. */
export async function quitterMonDossier(): Promise<void> {
  const langue = await langueEspace()
  const magasin = await cookies()
  magasin.set('cloison_capacite', '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
  })
  redirect(lien(langue, '/demarrer'))
}
