import type { Textes } from '@/lib/i18n'
import type { reutilisation as Fr } from '../reutilisation'

export const reutilisation: Textes<typeof Fr> = {
  titre: 'Reuse one of your documents',
  aide: 'Have you already uploaded a document to Cloison? Paste your guarantor link from that other file to choose a copy. Check that the document is still up to date and that it concerns you.',
  lien: 'Your guarantor link from the source file',
  chercher: 'Show the available documents',
  piece: 'Document to copy',
  consentement:
    'This document concerns me, it is still up to date and I authorise its copy into this file.',
  copier: 'Copy this document',
  attente: 'Checking…',
  separation:
    'The copy will be encrypted for this file and will follow its own retention period. Removing the document from the source file does not remove this copy. No access right is shared between files.',
  erreur:
    'The copy is not confirmed. Reload this file before trying again. Check both links, that the document is available and that the receiving file still accepts uploads.',
  lienInvalide:
    'This link cannot be used to read the documents of another guarantor file on this site.',
  vide: 'No document under 4 MB is available in this file.',
  succes:
    'The copy is confirmed in this file. You can view it or remove it along with your other documents.',
  choix: 'Choose a document and confirm your consent before copying it.',
}
