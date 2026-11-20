import type { Textes } from '@/lib/i18n'
import type { collaborateurs as Fr } from '../collaborateurs'

export const collaborateurs: Textes<typeof Fr> = {
  titre: 'Team members',
  retour: 'All files',
  aide: 'A team member asks to join the agency with an address from its domain. They can access no file until an administrator has accepted their request. An administrator can then change their role or remove their access.',
  adresseMasquee: 'Address outside the agency’s domain',
  roles: {
    admin: 'Administrator',
    membre: 'Member',
    exclu: 'Access removed',
    en_attente: 'Request pending',
    approuve: 'Request accepted, access at their next sign-in',
  },
  accepter: 'Accept the request',
  refuser: 'Decline the request',
  action: 'Change',
  choisir: 'Choose an action',
  promouvoir: 'Make administrator',
  retrograder: 'Make member',
  exclure: 'Remove access',
  readmettre: 'Allow them back',
  mfa: 'Reset two-factor authentication',
  aideMfa:
    'If a team member has lost their phone, check their identity by a means other than email, for example by calling them. Resetting removes their two-factor apps and closes their sessions: they sign in again with their usual link and register a new app before accessing files.',
  confirmer: 'I confirm this change of access.',
  appliquer: 'Apply',
  attente: 'Changing…',
  succes: 'Change saved.',
  readmission:
    'Allowing them back lets the team member join the agency again at their next sign-in. No email is sent.',
  session: 'Your session does not allow this change.',
  invalide: 'Choose an action and confirm it.',
  autreAgence: 'The agency shown has changed. Reload the page.',
  dernierAdmin: 'Name another administrator first before removing this role.',
  echec:
    'The change did not go through or the situation has changed. Reload the page before trying again.',
  journal: 'Latest access changes',
  aucun: 'No team member on this page.',
  journalVide: 'No change recorded.',
  actions: {
    role: 'Role changed',
    exclusion: 'Access removed',
    readmission: 'Return allowed',
    approbation: 'Request accepted',
    refus: 'Request declined',
    mfa: 'Two-factor authentication reset',
  },
  demande: {
    titre: 'Request sent',
    texte: (domaine) =>
      `An agency already exists for the domain ${domaine || 'of your address'}. One of its administrators must accept your request before you can access its files.`,
    aide: 'Reload this page once your request has been accepted. If no one replies, contact an administrator of your agency directly.',
    signal: (n) =>
      n === 1
        ? 'One access request is waiting for your decision.'
        : `${n} access requests are waiting for your decision.`,
    lien: 'See team members',
  },
  operateur: 'Identity not shown',
  cible: 'Team member',
  par: 'By',
  page: (n) => `Page ${n}`,
  precedente: 'Previous page',
  suivante: 'Next page',
  pagination: 'Team member pages',
}
