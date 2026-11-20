import type { Textes } from '@/lib/i18n'
import type { aideDossier as Fr } from '../support-dossier'

export const aideDossier: Textes<typeof Fr> = {
  titre: 'Need help with this file?',
  aide: 'Prepare a message with the reference and the category of the problem, then complete it and send it from your email.',
  aideLocataire:
    'Prepare a message with the reference and the category of the problem, then complete it and send it from your email.',
  confidentialite:
    'Do not attach any supporting document, amount, identity document or access link. Support does not open documents on your behalf.',
  confidentialiteLocataire:
    'Do not attach any supporting document, amount, identity document or access link. Support does not open documents on your behalf.',
  categorie: 'Category of the problem',
  apercu: 'Message to complete in your email',
  ouvrir: 'Open my email',
  copier: 'Copy the message',
  copie: 'Message copied. You still need to send it from your email.',
  copieLocataire: 'Message copied. You still need to send it from your email.',
  erreurCopie: 'Copy unavailable. The message can be selected in the field above.',
  destinataire: 'Support address',
  reference: 'File reference',
  parcours: 'Space used',
  objet: 'Cloison help',
  invitation:
    'Describe what is blocking you before sending, without any supporting document, amount, full identity or access link.',
  categories: {
    acces: 'Access to my space',
    suivi: 'Progress of the file',
    paiement: 'Payment of the tenant file',
    depot: 'Uploading or replacing a document',
    engagement: 'Entering my commitment',
    examen: 'Reviewing documents',
    equipe: 'Managing team members',
  },
  espaces: { agence: 'Agency', locataire: 'Tenant', garant: 'Guarantor' },
}
