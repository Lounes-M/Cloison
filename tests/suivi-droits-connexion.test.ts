import { expect, test, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
const doubles = vi.hoisted(() => ({
  configurations: [] as Record<string, unknown>[],
  fin: vi.fn(),
}))
vi.mock('pg', () => ({
  Client: class {
    constructor(configuration: Record<string, unknown>) {
      doubles.configurations.push(configuration)
    }
    on() {}
    async connect() {
      throw new Error('Connexion fictive interrompue')
    }
    async end() {
      doubles.fin()
    }
  },
}))
import { enregistrerSuiviDroits } from '../scripts/consigner-suivi-droits.mjs'
import { lireSuiviDroits } from '../scripts/examiner-suivi-droits.mjs'
test.each(['lecture', 'ecriture'])(
  'la %s exige TLS distant et ferme une connexion en echec',
  async (mode) => {
    const connexion = 'postgresql://db.example.com/fiction'
    const config = {
      connexion,
      operation: randomUUID(),
      demande: randomUUID(),
      precedente: null,
      operateur: randomUUID(),
      nature: 'acces',
      etat: 'recue',
      recuLe: new Date(Date.now() - 86400000).toISOString(),
      repondreAvant: new Date(Date.now() + 86400000).toISOString(),
      effacerLe: new Date(Date.now() + 86400000 * 2).toISOString(),
      preuve: 'Preuve fictive',
    }
    doubles.configurations.length = 0
    doubles.fin.mockClear()
    await expect(
      mode === 'lecture'
        ? lireSuiviDroits({ connexion, selection: { etat: 'ouverts' } })
        : enregistrerSuiviDroits(config),
    ).rejects.toThrow('Connexion fictive interrompue')
    expect(doubles.configurations).toEqual([
      {
        connectionString: connexion,
        connectionTimeoutMillis: 5000,
        query_timeout: 6000,
        ssl: { rejectUnauthorized: true },
      },
    ])
    expect(doubles.fin).toHaveBeenCalledOnce()
  },
)
