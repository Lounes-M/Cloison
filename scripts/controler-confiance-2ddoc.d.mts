import type { Autorite } from '../lib/2ddoc/autorites.ts'

type Liste = {
  sequence: string | undefined
  emission: string | undefined
  prestataires: {
    code: string
    adresse: string | undefined
    statut: string | undefined
    empreinte: string
  }[]
}
export function lireListe(xml: string): Liste
export function comparer(liste: Liste, autorites?: Readonly<Record<string, Autorite>>): string[]
