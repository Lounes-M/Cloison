import 'server-only'
import { z } from 'zod'
import { estUuidCanonique } from '@/lib/validation/uuid'

function dateIcs(date: Date) {
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1970 ||
    date.getUTCFullYear() > 9999
  )
    throw new Error('Echeance indisponible.')
  return date.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z'
}

/** Pliage RFC 5545 a 75 octets, sans couper un caractere UTF-8. */
function ligne(valeur: string) {
  let courant = '',
    taille = 0
  const lignes: string[] = []
  for (const caractere of valeur) {
    const octets = Buffer.byteLength(caractere)
    if (taille + octets > 75) {
      lignes.push(courant)
      courant = ' '
      taille = 1
    }
    courant += caractere
    taille += octets
  }
  return [...lignes, courant].join('\r\n')
}

function texte(valeur: string) {
  return valeur
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/[,;]/g, '\\$&')
}

export function calendrierEcheance(
  dossier: { id: string; reference: string; expire_le: string },
  maintenant = new Date(),
) {
  if (
    !estUuidCanonique(dossier.id) ||
    typeof dossier.reference !== 'string' ||
    dossier.reference.length < 1 ||
    dossier.reference.length > 32 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(dossier.reference)
  )
    throw new Error('Echeance indisponible.')
  const expiration = new Date(dossier.expire_le)
  if (!z.iso.datetime({ offset: true }).safeParse(dossier.expire_le).success)
    throw new Error('Echeance indisponible.')
  if (expiration.getTime() <= maintenant.getTime()) throw new Error('Echeance indisponible.')
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Cloison//Echeances//FR',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:coffre-${dossier.id}@cloison.immo`,
      `DTSTAMP:${dateIcs(maintenant)}`,
      `DTSTART:${dateIcs(expiration)}`,
      `SUMMARY:${texte(`Cloison : fin du coffre ${dossier.reference}`)}`,
      `DESCRIPTION:${texte('Échéance du coffre documentaire. Cette date ne décrit pas la durée de l’acte signé. Copie ponctuelle : vérifier la date courante dans Cloison. Aucun suivi automatique après import.')}`,
      'CLASS:PRIVATE',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(ligne)
      .join('\r\n') + '\r\n'
  )
}
