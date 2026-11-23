import type { Textes } from '@/lib/i18n'
import type { authenticite as Fr } from '../authenticite'

export const authenticite: Textes<typeof Fr> = {
  titre: '2D-Doc code on the tax notice',
  aide: 'French tax notices carry a signed barcode, the 2D-Doc. Cloison reads it and checks its signature. No AI is involved and nothing from the document is sent to a third party.',
  lancer: 'Check the code',
  attente: 'Checking…',
  erreur: 'Check unavailable: access, quota or processing issue. You can still open the document.',
  authentique: 'Authentic code',
  authentiqueAide:
    'This code was signed by the issuer below. It says nothing about the rest of the page: compare the signed values with those printed on the notice.',
  nonVerifiable: 'Cannot be verified',
  aucunCode:
    'No readable 2D-Doc code on this document. This is common with a photo, a scan or an older document, and says nothing about the document itself.',
  nonEtabli:
    'A code was read, but its signature could not be confirmed against a recognised issuer. This is not enough to conclude anything: review the document as usual.',
  emetteur: 'Issuer',
  signeLe: 'Signed on',
  annee: 'Income year',
  declarants: 'Taxpayer(s)',
  revenuFiscalDeReference: 'Reference tax income',
  parts: 'Number of tax shares',
  reference: 'Notice reference',
  sansValeur: 'The signed values could not be detailed for this code.',
  temporaire: 'Temporary result, not saved in the file. The decision is yours.',
  effacer: 'Clear the result',
}
