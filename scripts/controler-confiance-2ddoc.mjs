// Compare les autorites epinglees (lib/2ddoc/autorites.ts) a la liste de
// confiance publiee par l'ANTS. A lancer depuis un poste qui joint ants.gouv.fr,
// avant d'activer VERIFICATION_2DDOC_ACTIVE puis a chaque nouvelle liste.
//
// Usage : node scripts/controler-confiance-2ddoc.mjs [fichier-tsl.xml]
//
// Sans argument, la liste est telechargee a son point de distribution. Le
// script ne modifie rien : il dit ce qui concorde, ce qui manque et ce qui
// differe. Il ne verifie pas la signature XML de la liste ; la provenance
// repose sur TLS vers pub.ants.gouv.fr ou sur le fichier fourni.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { AUTORITES } from '../lib/2ddoc/autorites.ts'

const ADRESSE = 'https://pub.ants.gouv.fr/2D-DOC/V1/PRD/01_TSL/tsl_signed.xml'

/** Extrait {code, adresse, statut, empreinte} de chaque prestataire de la liste. */
export function lireListe(xml) {
  const prestataires = []
  for (const [, bloc] of xml.matchAll(
    /<tsl:TrustServiceProvider>([\s\S]*?)<\/tsl:TrustServiceProvider>/g,
  )) {
    const code = /<tsl:TSPTradeName>\s*<tsl:Name[^>]*>([^<]+)</.exec(bloc)?.[1]?.trim()
    const adresse = /<tsl:TSPInformationURI>\s*<tsl:URI[^>]*>([^<]+)</
      .exec(bloc)?.[1]
      ?.trim()
      .replaceAll('&amp;', '&')
    for (const [, service] of bloc.matchAll(/<tsl:TSPService>([\s\S]*?)<\/tsl:TSPService>/g)) {
      const certificat = /<tsl:X509Certificate>([^<]+)</.exec(service)?.[1]
      const statut = /<tsl:ServiceStatus>([^<]+)</.exec(service)?.[1]?.split('/').pop()
      if (!code || !certificat) continue
      prestataires.push({
        code,
        adresse,
        statut,
        empreinte: createHash('sha256')
          .update(Buffer.from(certificat.replace(/\s+/g, ''), 'base64'))
          .digest('hex'),
      })
    }
  }
  return {
    sequence: /<tsl:TSLSequenceNumber>(\d+)</.exec(xml)?.[1],
    emission: /<tsl:ListIssueDateTime>([^<]+)</.exec(xml)?.[1],
    prestataires,
  }
}

/** Ecarts entre la liste et les autorites epinglees. Liste vide : tout concorde. */
export function comparer(liste, autorites = AUTORITES) {
  const ecarts = []
  const publiees = new Map()
  for (const p of liste.prestataires) {
    if (p.statut !== 'inaccord') continue
    publiees.set(p.code, [...(publiees.get(p.code) ?? []), p])
  }
  for (const [code, autorite] of Object.entries(autorites)) {
    const candidates = publiees.get(code)
    if (!candidates) ecarts.push(`${code} : epinglee mais absente ou retiree de la liste publiee`)
    else if (!candidates.some((p) => p.empreinte === autorite.empreinte))
      ecarts.push(`${code} : le certificat epingle n'est pas celui de la liste publiee`)
    else if (!candidates.some((p) => p.adresse === autorite.adresse))
      ecarts.push(`${code} : l'adresse de publication a change`)
  }
  for (const code of publiees.keys())
    if (!Object.hasOwn(autorites, code))
      ecarts.push(`${code} : publiee par l'ANTS mais pas epinglee`)
  return ecarts
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) {
  try {
    let xml
    if (process.argv[2]) xml = await readFile(process.argv[2], 'utf8')
    else {
      const reponse = await fetch(ADRESSE, {
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      })
      if (!reponse.ok) throw new Error(`Liste indisponible (${reponse.status})`)
      xml = await reponse.text()
    }
    const liste = lireListe(xml)
    if (!liste.prestataires.length) throw new Error('Liste illisible')
    console.log(`Liste ANTS numero ${liste.sequence}, emise le ${liste.emission}`)
    const ecarts = comparer(liste)
    if (ecarts.length) {
      for (const ecart of ecarts) console.error(`ECART ${ecart}`)
      process.exitCode = 1
    } else
      console.log(
        `OK : ${Object.keys(AUTORITES).length} autorites epinglees conformes a la liste publiee`,
      )
  } catch (erreur) {
    console.error(`Controle impossible : ${erreur instanceof Error ? erreur.message : 'erreur'}`)
    process.exitCode = 1
  }
}
