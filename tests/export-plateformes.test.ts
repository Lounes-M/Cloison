import { afterEach, expect, test, vi } from 'vitest'
import { exporterDroits } from '../scripts/exporter-droits.mjs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

afterEach(() => vi.unstubAllGlobals())

test.each(['win32', 'inconnu'])(
  'refuse %s avant toute lecture de la decision',
  async (plateforme) => {
    vi.stubGlobal('process', { ...process, platform: plateforme })
    await expect(
      exporterDroits(
        'creer',
        'decision-inexistante-privee',
        'source-inexistante-privee',
        'destination-inexistante-privee',
        Buffer.alloc(32),
      ),
    ).rejects.toThrow('Export personnel indisponible sur ce systeme.')
  },
)

test.each(['win32', 'inconnu'])(
  'refuse aussi lextraction sur %s avant de lire le paquet',
  async (plateforme) => {
    vi.stubGlobal('process', { ...process, platform: plateforme })
    await expect(
      exporterDroits(
        'extraire',
        'decision-inexistante-privee',
        'paquet-inexistant-prive',
        'destination-inexistante-privee',
        Buffer.alloc(32),
      ),
    ).rejects.toThrow('Export personnel indisponible sur ce systeme.')
  },
)

test.skipIf(process.platform !== 'win32')(
  'le vrai CLI Windows refuse avant la lecture du descripteur de cle',
  () => {
    const resultat = spawnSync(
      process.execPath,
      [
        resolve('scripts/exporter-droits.mjs'),
        'creer',
        'decision-privee',
        'source-privee',
        'destination-privee',
      ],
      { encoding: 'utf8', timeout: 5000 },
    )
    expect(resultat.status).toBe(1)
    expect(resultat.stdout).toBe('')
    expect(resultat.stderr).toContain('Export personnel indisponible sur ce systeme.')
    for (const mot of ['decision-privee', 'source-privee', 'destination-privee'])
      expect(resultat.stderr).not.toContain(mot)
  },
)
