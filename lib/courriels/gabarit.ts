import { gabaritCourriel as gabaritEn } from '@/lib/content/en/gabarit-courriel'
import { gabaritCourriel as gabaritFr } from '@/lib/content/gabarit-courriel'
import { choisir, lien, type Langue } from '@/lib/i18n'

/**
 * L'habillage commun des courriels de Cloison.
 *
 * Chaque courriel part en deux versions : le texte, que tout lecteur sait
 * afficher et que les filtres lisent en premier, et le HTML, aux couleurs du
 * site. Les deux disent exactement la meme chose, dans le meme ordre.
 *
 * Le HTML reprend les sections du site public : bandeau vert au logo blanc,
 * fond creme sans carte ni pastille, grand titre, bouton a case orange, traits
 * fins, pied vert aux liens soulignes. Il est ecrit pour les messageries, pas
 * pour un navigateur : tableaux, styles en ligne, aucune image, aucune police
 * distante, aucun script. Le logo est du texte, comme sur le site. Rien n'est charge a l'ouverture, donc rien
 * ne signale a un tiers que le courriel a ete lu.
 */

export type Espace = 'locataire' | 'garant' | 'agence'

export type Courriel = {
  langue: Langue
  /** L'espace concerne : il choisit le libelle du bouton. */
  espace: Espace
  sujet: string
  /** La phrase en tete de carte. Sans elle, le sujet. */
  titre?: string
  paragraphes: string[]
  /** Un seul lien par courriel, et seulement quand le courriel en porte un. */
  bouton?: { url: string; libelle?: string }
  /** Precisions sous le bouton : validite du lien, consigne. */
  notes?: string[]
  details?: { libelle: string; valeur: string }[]
}

export type Corps = { text: string; html: string }

/** Les couleurs du site (`app/globals.css`), ecrites en dur : un courriel n'a pas de variables. */
const COULEURS = {
  fond: '#faf4ec',
  encre: '#1e1e1e',
  discret: '#5e5e5e',
  primaire: '#035946',
  accent: '#fe5000',
  trait: '#d9d2c7',
  clairSurVert: '#d5e3dc',
} as const

const POLICE = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif"

/** Tout ce qui vient d'une saisie ou de la base passe par ici avant le HTML. */
export function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Un lien n'entre dans un attribut que s'il est en http(s). */
function adresseSure(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

function texteBrut(c: Courriel, t: typeof gabaritFr | typeof gabaritEn): string {
  const lignes: string[] = []
  if (c.titre) lignes.push(c.titre, '')
  lignes.push(c.paragraphes.join('\n\n'))
  if (c.bouton) lignes.push('', c.bouton.url)
  if (c.notes?.length) lignes.push('', c.notes.join('\n'))
  if (c.details?.length)
    lignes.push('', c.details.map((d) => `${d.libelle} : ${d.valeur}`).join('\n'))
  lignes.push('', 'Cloison', t.signature)
  return lignes.join('\n')
}

export function composerCourriel(c: Courriel, site: string): Corps {
  const t = choisir(c.langue, gabaritFr, gabaritEn)
  const url = c.bouton ? adresseSure(c.bouton.url) : null
  const titre = echapper(c.titre ?? c.sujet)
  const apercu = echapper(c.paragraphes[0] ?? '')
  const p = (texte: string, style: string) =>
    `<p style="margin:0 0 16px;font-family:${POLICE};${style}">${echapper(texte)}</p>`

  const paragraphes = c.paragraphes
    .map((texte) => p(texte, `font-size:16px;line-height:1.65;color:${COULEURS.encre};`))
    .join('')

  // Le bouton du site : une etiquette pleine et, collee a elle, la case orange
  // qui porte la fleche. Deux cellules, pour que les messageries le tiennent.
  const bouton =
    c.bouton && url
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 24px;"><tr><td bgcolor="${COULEURS.primaire}" style="border-radius:10px;background:${COULEURS.primaire};"><a href="${echapper(url)}" style="display:block;padding:17px 18px;font-family:${POLICE};font-size:17px;font-weight:600;line-height:18px;color:#ffffff;text-decoration:none;">${echapper(c.bouton.libelle ?? t.boutons[c.espace])}</a></td><td width="4" style="width:4px;font-size:0;line-height:0;">&nbsp;</td><td width="52" align="center" bgcolor="${COULEURS.accent}" style="width:52px;border-radius:10px;background:${COULEURS.accent};"><a href="${echapper(url)}" aria-hidden="true" tabindex="-1" style="display:block;padding:17px 0;font-family:${POLICE};font-size:22px;font-weight:400;line-height:18px;color:#ffffff;text-decoration:none;">&rarr;</a></td></tr></table>` +
        p(
          t.lienBrut,
          `font-size:13px;line-height:1.5;color:${COULEURS.discret};margin-bottom:6px;`,
        ) +
        `<p style="margin:0 0 24px;font-family:${POLICE};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${echapper(url)}" style="color:${COULEURS.primaire};text-decoration:underline;">${echapper(url)}</a></p>`
      : ''

  const notes = (c.notes ?? [])
    .map((texte) => p(texte, `font-size:14px;line-height:1.6;color:${COULEURS.discret};`))
    .join('')

  // Un trait fin au-dessus, le libelle dessous : comme les chiffres de l'accueil.
  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;">${c.details
        .map(
          (d) =>
            `<tr><td style="padding:14px 0 16px;border-top:1px solid ${COULEURS.trait};font-family:${POLICE};"><span style="display:block;font-size:20px;line-height:1.3;font-weight:600;color:${COULEURS.primaire};">${echapper(d.valeur)}</span><span style="display:block;margin-top:2px;font-size:13px;line-height:1.5;color:${COULEURS.encre};">${echapper(d.libelle)}</span></td></tr>`,
        )
        .join('')}</table>`
    : ''

  const pied = [
    [t.mentions, '/mentions-legales'],
    [t.confidentialite, '/confidentialite'],
  ]
    .map(
      ([libelle, chemin]) =>
        `<a href="${echapper(site + lien(c.langue, chemin as '/mentions-legales'))}" style="color:#ffffff;text-decoration:underline;">${echapper(libelle!)}</a>`,
    )
    .join(' &nbsp;&nbsp; ')

  const logo = `CLOI<span style="display:inline-block;width:6px;height:20px;margin:0 2px;border-radius:2px;background:${COULEURS.accent};vertical-align:-3px;"></span>SON`
  const surVert = (texte: string) =>
    `<p style="margin:0 0 12px;font-family:${POLICE};font-size:13px;line-height:1.6;color:${COULEURS.clairSurVert};">${echapper(texte)}</p>`

  const html = `<!doctype html>
<html lang="${c.langue}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${echapper(c.sujet)}</title>
</head>
<body style="margin:0;padding:0;background:${COULEURS.fond};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COULEURS.fond};">${apercu}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.fond}" style="background:${COULEURS.fond};">
<tr><td align="center" bgcolor="${COULEURS.primaire}" style="background:${COULEURS.primaire};padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:22px 0;font-family:${POLICE};font-size:22px;font-weight:600;letter-spacing:0;line-height:1;color:#ffffff;">${logo}</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:48px 0 44px;">
<h1 style="margin:0 0 22px;font-family:${POLICE};font-size:32px;line-height:1.15;font-weight:600;letter-spacing:-0.01em;color:${COULEURS.encre};">${titre}</h1>
${paragraphes}${bouton}${notes}${details}
</td></tr>
</table>
</td></tr>
<tr><td align="center" bgcolor="${COULEURS.primaire}" style="background:${COULEURS.primaire};padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:32px 0 36px;">
<p style="margin:0 0 18px;font-family:${POLICE};font-size:15px;line-height:1.4;color:#ffffff;"><span style="display:block;margin:0 0 6px;font-size:18px;font-weight:600;">${logo}</span>${echapper(t.signature)}</p>
${surVert(t.automatique)}${surVert(t.pourquoi)}
<p style="margin:18px 0 0;font-family:${POLICE};font-size:14px;line-height:1.6;color:#ffffff;">${pied}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { text: texteBrut(c, t), html }
}
