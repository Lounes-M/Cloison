import type { Textes } from '@/lib/i18n'
import type { connecteurs as Fr } from '../connecteurs'

export const connecteurs: Textes<typeof Fr> = {
  titre: 'Software connections',
  aide: 'Create read access for your software or automation tool. It will only receive the references and simplified statuses of your agency’s files.',
  limites:
    'Five active accesses at most, valid for 90 days. Each access allows 60 reads per minute. Revoke the accesses you no longer use.',
  nom: 'Name of the software or connection',
  creer: 'Create an access',
  revoquer: 'Revoke this access',
  confirmation: 'I confirm this operation on my agency’s accesses.',
  attente: 'Saving…',
  echec: 'Operation not possible. Check your session, the details and the access limits.',
  succes: 'Access revoked.',
  cle: 'Private key, shown only once',
  conserver:
    'Copy this key into your software’s secrets manager. It will not be shown again once the page is closed or the key hidden.',
  fermer: 'Hide the key',
  actif: 'Active',
  expire: 'Expired',
  revoque: 'Revoked',
  expiration: 'Expiry',
  utilisation: 'Last used',
  jamais: 'Never',
  aucun: 'No access created.',
  documentation: 'OpenAPI documentation',
  retour: 'Back to files',
}
