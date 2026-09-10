import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
export function nouvelleCleConnecteur() {
  return `cloison_read_${randomBytes(32).toString('base64url')}`
}
export function empreinteConnecteur(cle: string) {
  if (!/^cloison_read_[A-Za-z0-9_-]{43}$/.test(cle)) return null
  return createHash('sha256').update(cle).digest('hex')
}
