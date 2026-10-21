import type { Server } from 'node:http'

export function creerServiceDocumentaire(options: {
  secret: string
  image: string
  traiter?: (entree: Buffer, image: string) => Promise<Buffer>
  etat?: () => { actifs: number; bloque: boolean }
  sonderImage?: () => Promise<boolean>
  journal?: (message: string) => void
  maintenant?: () => number
}): Server & {
  verifierDisponibilite(): Promise<boolean>
  attendreFin(): Promise<boolean>
}
