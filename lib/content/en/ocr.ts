import type { Textes } from '@/lib/i18n'
import type { ocr as Fr } from '../ocr'

export const ocr: Textes<typeof Fr> = {
  titre: 'Reading aid',
  accord: 'Send this copy to OpenRouter and its AI provider to extract its text.',
  aide: 'The transcription may be incomplete or wrong. Compare it with the original document. It checks neither its authenticity nor the guarantor’s solvency.',
  lancer: 'Extract the text',
  attente: 'Reading…',
  erreur:
    'Reading unavailable: access, quota or processing issue. You can still open the document.',
  effacer: 'Erase the transcription',
  temporaire: 'Temporary result, not saved in the file.',
  modele: 'Model',
  empreinte: 'Fingerprint of the copy analysed',
  page: 'Page',
  pages: 'Pages to read',
  pagesAide:
    'Leave empty for all pages, or enter for example 1, 3-5. Only the chosen pages will be sent, with their watermark. 40 pages at most.',
  pagesInvalides: 'Enter pages between 1 and 40, separated by commas, or a range such as 3-5.',
  accordSelection: (pages) =>
    `Send only pages ${pages} of this copy to OpenRouter and its AI provider to extract their text.`,
  interrompre: 'Stop reading',
  interrompue:
    'Reading stopped and result erased. Data already sent to the provider cannot be recalled.',
  rechercher: 'Search the transcription',
  aucunePage: 'No page contains this text.',
  choisirPage: 'Transcription page',
  precedente: 'Previous page',
  suivante: 'Next page',
  position: (index, total) => `Result ${index} of ${total}`,
  vide: 'No legible text returned for this page.',
}
