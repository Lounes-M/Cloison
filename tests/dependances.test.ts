import { describe, expect, it } from 'vitest'
// @ts-expect-error Programme Node autonome.
import { verifierAudit } from '../scripts/verifier-dependances.mjs'

function rapport(severity?: string) {
  return {
    auditReportVersion: 2,
    vulnerabilities: severity ? { paquet: { name: 'paquet', severity } } : {},
  }
}
describe('controle des avis de dependances', () => {
  it('accepte un audit sans avis', () => {
    expect(() => verifierAudit(rapport())).not.toThrow()
  })
  it('laisse passer un avis modere', () => {
    expect(() => verifierAudit(rapport('moderate'))).not.toThrow()
  })
  it('refuse un avis eleve', () => {
    expect(() => verifierAudit(rapport('high'))).toThrow()
  })
  it('refuse un avis critique', () => {
    expect(() => verifierAudit(rapport('critical'))).toThrow()
  })
  it('refuse un rapport en erreur', () => {
    expect(() => verifierAudit({ ...rapport(), error: { code: 'ENOAUDIT' } })).toThrow()
  })
  it('refuse un rapport incomplet', () => {
    expect(() => verifierAudit({})).toThrow()
  })
})
