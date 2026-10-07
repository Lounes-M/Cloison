/** Seul le bucket prive du projet courant peut fournir le paquet chiffre. */
export function verifierUrlRemise(valeur: string, origine: string, id: string): string {
  const base = new URL(origine)
  const url = new URL(valeur)
  if (
    base.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(base.hostname) ||
    base.port ||
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== `/storage/v1/object/sign/exports-droits/${id}` ||
    [...url.searchParams.keys()].join(',') !== 'token' ||
    !/^[A-Za-z0-9_.-]{20,8192}$/.test(url.searchParams.get('token') ?? '')
  )
    throw new Error('Lien de remise refuse.')
  return url.href
}
