import { messageDefaut, messagesServeur } from '@/lib/content/en/messages'
import type { Langue } from '@/lib/i18n'

/**
 * Les messages que le serveur renvoie a une personne sont ecrits en francais,
 * la ou ils naissent : schemas, actions, coffre. `traducteur` les rend dans la
 * langue de la personne au moment de les lui renvoyer.
 *
 * Un message sans version anglaise retombe sur une phrase generique plutot que
 * sur du francais : un test verifie qu'aucun message des actions n'en manque.
 */
export function traducteur(langue: Langue): (message: string) => string {
  if (langue === 'fr') return (message) => message
  return (message) => messagesServeur[message] ?? messageDefaut
}
