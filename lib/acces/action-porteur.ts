'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/** Quitte ce navigateur. La reemission du lien reste la revocation distante. */
export async function quitterMonDossier(): Promise<void> {
  const magasin = await cookies()
  magasin.set('cloison_capacite', '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
  })
  redirect('/demarrer')
}
