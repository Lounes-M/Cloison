import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CRON_SECRET, SITE, SUPABASE } from './environnement.mjs'

/** Le code TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) d'un secret en base32. */
export function codeTotp(secretBase32, instant = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secretBase32.replace(/[\s=]/g, '').toUpperCase()) {
    const v = alphabet.indexOf(c)
    assert(v >= 0, 'Secret TOTP illisible')
    bits += v.toString(2).padStart(5, '0')
  }
  const cle = Buffer.from(bits.match(/.{8}/g).map((o) => parseInt(o, 2)))
  const compteur = Buffer.alloc(8)
  compteur.writeBigUInt64BE(BigInt(Math.floor(instant / 30_000)))
  const h = createHmac('sha1', cle).update(compteur).digest()
  const d = h[h.length - 1] & 15
  return String((h.readUInt32BE(d) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

/** Attend qu'une lecture rende une valeur, sans boucle infinie. */
export async function jusqua(lire, quoi, delai = 15_000) {
  const fin = Date.now() + delai
  for (;;) {
    const valeur = await lire()
    if (valeur) return valeur
    if (Date.now() > fin) throw new Error(`Jamais arrive : ${quoi}`)
    await attendre(200)
  }
}

/** Le dernier courriel d'Auth recu par une adresse, dans la boite locale. */
export async function courrielAuth(adresse, apres = 0) {
  return jusqua(async () => {
    const liste = await (
      await fetch(`${SUPABASE.courrier}/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`)
    ).json()
    const message = (liste.messages ?? []).find((m) => new Date(m.Created).getTime() >= apres)
    if (!message) return null
    return (await fetch(`${SUPABASE.courrier}/api/v1/message/${message.ID}`)).json()
  }, `courriel de connexion pour ${adresse}`)
}

/** Le premier lien d'un courriel qui commence par ce prefixe. */
export function lienDans(texte, prefixe) {
  const trouve = new RegExp(
    `${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s"'<>)\\]]+`,
  ).exec(String(texte).replaceAll('&amp;', '&'))
  assert(trouve, `Aucun lien ${prefixe} dans le courriel`)
  return trouve[0]
}

/** Le texte d'un PDF, pages reunies. */
export async function texteDuPdf(octets) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(octets), useSystemFonts: true }).promise
  let texte = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const contenu = await (await pdf.getPage(i)).getTextContent()
    texte += `${contenu.items.map((e) => e.str).join(' ')}\n`
  }
  await pdf.loadingTask.destroy()
  return texte
}

/**
 * Range un PDF produit par le site avec les captures, et sa premiere page en
 * image si `pdftoppm` est installe. Sans dossier de captures, ne fait rien.
 */
export async function capturerPdf(monde, etape, octets) {
  const dossier = process.env.PARCOURS_CAPTURES
  if (!dossier) return
  mkdirSync(dossier, { recursive: true })
  const base = join(dossier, `${etape}-${monde.nom}`)
  writeFileSync(`${base}.pdf`, octets)
  try {
    execFileSync(
      'pdftoppm',
      ['-r', '80', '-png', '-f', '1', '-l', '1', '-singlefile', `${base}.pdf`, base],
      {
        stdio: 'ignore',
        timeout: 20_000,
      },
    )
  } catch {
    /* Le PDF reste disponible. */
  }
}

/**
 * Le passage de la maintenance, comme le declenche le planificateur : purge,
 * liens, notifications de statut, rappels, puis distribution des courriels.
 * Les courriels de statut ne partent qu'a ce moment-la.
 */
export async function passerLaMaintenance() {
  const reponse = await fetch(`${SITE}/api/maintenance`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const bilan = await reponse.json().catch(() => null)
  assert.equal(reponse.status, 200, `Maintenance en echec : ${JSON.stringify(bilan)}`)
  return bilan
}
