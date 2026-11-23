import { expect, test } from 'vitest'

import { AUTORITES } from '@/lib/2ddoc/autorites'
import { comparer, lireListe } from '../scripts/controler-confiance-2ddoc.mjs'

/** Une liste fictive a la forme de celle de l'ANTS, batie depuis les autorites epinglees. */
function liste(modifier: (code: string, bloc: string) => string | null = (_c, bloc) => bloc) {
  const blocs = Object.entries(AUTORITES).map(([code, a]) =>
    modifier(
      code,
      `<tsl:TrustServiceProvider><tsl:TSPInformation><tsl:TSPTradeName><tsl:Name xml:lang="en">${code}</tsl:Name></tsl:TSPTradeName>
       <tsl:TSPInformationURI><tsl:URI xml:lang="fr">${a.adresse.replaceAll('&', '&amp;')}</tsl:URI></tsl:TSPInformationURI></tsl:TSPInformation>
       <tsl:TSPServices><tsl:TSPService><tsl:X509Certificate>${a.certificat.replace(/-----[A-Z ]+-----/g, '')}</tsl:X509Certificate>
       <tsl:ServiceStatus>http://uri.etsi.org/TrstSvc/Svcstatus/inaccord</tsl:ServiceStatus></tsl:TSPService></tsl:TSPServices></tsl:TrustServiceProvider>`,
    ),
  )
  return lireListe(
    `<tsl:TSLSequenceNumber>23</tsl:TSLSequenceNumber>${blocs.filter(Boolean).join('')}`,
  )
}

test('une liste identique aux autorites epinglees ne signale aucun ecart', () => {
  const lue = liste()
  expect(lue.sequence).toBe('23')
  expect(lue.prestataires).toHaveLength(Object.keys(AUTORITES).length)
  expect(comparer(lue)).toEqual([])
})

test('une autorite retiree, revoquee, remplacee ou ajoutee est signalee', () => {
  expect(comparer(liste((code, bloc) => (code === 'FR04' ? null : bloc)))).toEqual([
    'FR04 : epinglee mais absente ou retiree de la liste publiee',
  ])
  expect(
    comparer(liste((code, bloc) => (code === 'FR01' ? bloc.replace('inaccord', 'revoked') : bloc))),
  ).toEqual(['FR01 : epinglee mais absente ou retiree de la liste publiee'])
  const autre = AUTORITES.FR06!.certificat.replace(/-----[A-Z ]+-----/g, '')
  expect(
    comparer(
      liste((code, bloc) =>
        code === 'FR05'
          ? bloc.replace(/<tsl:X509Certificate>[^<]+/, `<tsl:X509Certificate>${autre}`)
          : bloc,
      ),
    ),
  ).toEqual(["FR05 : le certificat epingle n'est pas celui de la liste publiee"])
  expect(
    comparer(
      liste((code, bloc) => bloc + (code === 'FR07' ? bloc.replaceAll('FR07', 'FR08') : '')),
    ),
  ).toEqual(["FR08 : publiee par l'ANTS mais pas epinglee"])
})
