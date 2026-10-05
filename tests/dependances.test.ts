import { describe, expect, it } from 'vitest'
// @ts-expect-error Programme Node autonome.
import { verifierAudit } from '../scripts/verifier-dependances.mjs'

function fixture() {
  return {
    rapport: {
      auditReportVersion: 2,
      vulnerabilities: {
        braces: {
          name: 'braces',
          severity: 'high',
          nodes: ['node_modules/braces'],
          via: [
            {
              name: 'braces',
              url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
              range: '<=3.0.3',
              severity: 'high',
            },
          ],
        },
        micromatch: {
          name: 'micromatch',
          severity: 'high',
          nodes: ['node_modules/micromatch'],
          via: ['braces'],
        },
      },
    },
    lock: {
      packages: {
        'node_modules/braces': { dev: true, version: '3.0.3' },
        'node_modules/micromatch': { dev: true, version: '4.0.8' },
      },
    },
  }
}
const date = new Date('2026-10-05T12:00:00Z')
describe('controle des avis de dependances', () => {
  it('accepte uniquement la chaine de developpement connue avant expiration', () => {
    const { rapport, lock } = fixture()
    expect(verifierAudit(rapport, lock, date)).toBe(true)
  })
  it('refuse une dependance partagee avec la production', () => {
    const { rapport, lock } = fixture()
    lock.packages['node_modules/braces'].dev = false
    expect(() => verifierAudit(rapport, lock, date)).toThrow()
  })
  it('refuse un nouvel avis meme sur le meme paquet', () => {
    const { rapport, lock } = fixture()
    rapport.vulnerabilities.braces.via[0]!.url = 'https://github.com/advisories/autre'
    expect(() => verifierAudit(rapport, lock, date)).toThrow()
  })
  it('refuse une exception expiree', () => {
    const { rapport, lock } = fixture()
    expect(() => verifierAudit(rapport, lock, new Date('2026-10-19T00:00:00Z'))).toThrow()
  })
  it('refuse une chaine cyclique', () => {
    const { rapport, lock } = fixture()
    rapport.vulnerabilities.micromatch.via = ['micromatch']
    expect(() => verifierAudit(rapport, lock, date)).toThrow()
  })
  it('refuse un rapport incomplet', () => {
    expect(() => verifierAudit({}, {}, date)).toThrow()
  })
})
