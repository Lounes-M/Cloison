import { spawnSync } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

test.skipIf(process.platform !== 'win32')('le CLI Windows refuse avant lecture de cle', () => {
  const r = spawnSync(process.execPath, [resolve('scripts/lire-statuts-connecteur.mjs')], {
    input: '',
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(r.status).toBe(1)
  expect(r.stdout).toBe('')
  expect(JSON.parse(r.stderr)).toEqual({ erreur: 'systeme_non_supporte', reessayerApres: null })
})

describe.skipIf(!['linux', 'darwin'].includes(process.platform))('CLI connecteur POSIX', () => {
  let racine: string
  const cle = 'cloison_read_' + 'a'.repeat(43)
  beforeEach(async () => {
    racine = await mkdtemp(join(tmpdir(), 'cloison-connecteur-'))
    await writeFile(join(racine, 'cle'), cle, { mode: 0o600 })
  })
  afterEach(async () => {
    await rm(racine, { recursive: true, force: true })
  })
  async function executer(mode: 'succes' | 'panne' = 'succes', args: string[] = []) {
    await writeFile(
      join(racine, 'transport.mjs'),
      `
      let page = 0;
      globalThis.fetch = async (adresse, options) => {
        const u = new URL(adresse);
        if (u.origin !== 'https://www.cloison.immo' || u.pathname !== '/api/connecteurs/v1/dossiers'
          || options.headers.Authorization !== 'Bearer ${cle}' || options.redirect !== 'error'
          || options.method !== 'GET') throw new Error('Transport invalide');
        page++;
        if (page === 1) return Response.json({version:1,dossiers:Array.from({length:50},(_,i)=>({reference:'REF-'+String(i).padStart(8,'0'),etat:'pret'})),suite:'REF-00000049'});
        if (page !== 2 || u.searchParams.get('apres') !== 'REF-00000049') throw new Error('Pagination invalide');
        return ${mode === 'panne' ? "new Response('secret_fournisseur_fictif', {status:503})" : 'Response.json({version:1,dossiers:[],suite:null})'};
      };
    `,
    )
    const fd = openSync(join(racine, 'cle'), 'r')
    try {
      return spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(join(racine, 'transport.mjs')).href,
          resolve('scripts/lire-statuts-connecteur.mjs'),
          ...args,
        ],
        { input: '', stdio: ['pipe', 'pipe', 'pipe', fd], encoding: 'utf8', timeout: 10000 },
      )
    } finally {
      closeSync(fd)
    }
  }
  test('rend une seule collecte JSON complete sans cle', async () => {
    const r = await executer()
    expect(r.status, r.stderr).toBe(0)
    const resultat = JSON.parse(r.stdout)
    expect(resultat.pages).toBe(2)
    expect(resultat.dossiers).toHaveLength(50)
    expect(r.stdout).not.toContain(cle)
    expect(r.stderr).toBe('')
  })
  test('ne publie pas la premiere page si la seconde echoue', async () => {
    const r = await executer('panne')
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(JSON.parse(r.stderr)).toEqual({ erreur: 'indisponible', reessayerApres: null })
    expect(r.stderr).not.toContain('secret_fournisseur')
  })
  test.each(['publique', 'retour_ligne', 'argument'])(
    'refuse une configuration %s',
    async (mode) => {
      if (mode === 'publique') await chmod(join(racine, 'cle'), 0o644)
      if (mode === 'retour_ligne') await writeFile(join(racine, 'cle'), cle + '\n')
      const r = await executer('succes', mode === 'argument' ? ['https://tiers.invalid'] : [])
      expect(r.status).toBe(1)
      expect(r.stdout).toBe('')
      expect(JSON.parse(r.stderr)).toEqual({ erreur: 'configuration', reessayerApres: null })
    },
  )
})
