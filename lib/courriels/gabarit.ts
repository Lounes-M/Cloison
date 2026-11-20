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
 * Le HTML est ecrit pour les messageries, pas pour un navigateur : tableaux,
 * styles en ligne, aucune image, aucune police distante, aucun script. Le logo
 * est du texte, comme sur le site. Rien n'est charge a l'ouverture, donc rien
 * ne signale a un tiers que le courriel a ete lu.
 */

export type Espace = 'locataire' | 'garant' | 'agence'

export type Courriel = {
  langue: Langue
  /** L'espace concerne : il colore la pastille et choisit le libelle du bouton. */
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

const COULEURS = {
  fond: '#faf4ec',
  carte: '#ffffff',
  encre: '#1e1e1e',
  discret: '#5e5e5e',
  primaire: '#035946',
  accent: '#fe5000',
  trait: '#e7e0d6',
  pastilles: { locataire: '#d5e3dc', garant: '#edb8d5', agence: '#f6dfeb' },
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
    .map((texte) => p(texte, `font-size:16px;line-height:1.6;color:${COULEURS.encre};`))
    .join('')

  const bouton =
    c.bouton && url
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td bgcolor="${COULEURS.primaire}" style="border-radius:999px;background:${COULEURS.primaire};"><a href="${echapper(url)}" style="display:inline-block;padding:15px 30px;font-family:${POLICE};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${echapper(c.bouton.libelle ?? t.boutons[c.espace])}&nbsp;<span style="color:${COULEURS.accent};">&rarr;</span></a></td></tr></table>` +
        p(
          t.lienBrut,
          `font-size:13px;line-height:1.5;color:${COULEURS.discret};margin-bottom:6px;`,
        ) +
        `<p style="margin:0 0 20px;font-family:${POLICE};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${echapper(url)}" style="color:${COULEURS.primaire};text-decoration:underline;">${echapper(url)}</a></p>`
      : ''

  const notes = (c.notes ?? [])
    .map((texte) => p(texte, `font-size:14px;line-height:1.55;color:${COULEURS.discret};`))
    .join('')

  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;border-top:1px solid ${COULEURS.trait};">${c.details
        .map(
          (d) =>
            `<tr><td style="padding:12px 0;border-bottom:1px solid ${COULEURS.trait};font-family:${POLICE};font-size:13px;color:${COULEURS.discret};">${echapper(d.libelle)}</td><td align="right" style="padding:12px 0;border-bottom:1px solid ${COULEURS.trait};font-family:${POLICE};font-size:14px;font-weight:600;color:${COULEURS.encre};">${echapper(d.valeur)}</td></tr>`,
        )
        .join('')}</table>`
    : ''

  const pied = [
    [t.mentions, '/mentions-legales'],
    [t.confidentialite, '/confidentialite'],
  ]
    .map(
      ([libelle, chemin]) =>
        `<a href="${echapper(site + lien(c.langue, chemin as '/mentions-legales'))}" style="color:${COULEURS.discret};text-decoration:underline;">${echapper(libelle!)}</a>`,
    )
    .join(' &nbsp;·&nbsp; ')

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
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 8px 20px;font-family:${POLICE};font-size:24px;font-weight:600;letter-spacing:0;line-height:1;color:${COULEURS.encre};">CLOI<span style="display:inline-block;width:7px;height:22px;margin:0 2px;border-radius:3px;background:${COULEURS.accent};vertical-align:-3px;"></span>SON</td></tr>
<tr><td bgcolor="${COULEURS.carte}" style="background:${COULEURS.carte};border-radius:24px;padding:36px 32px 28px;">
<p style="margin:0 0 18px;"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${COULEURS.pastilles[c.espace]};font-family:${POLICE};font-size:12px;font-weight:600;color:${COULEURS.encre};">${echapper(t.espaces[c.espace])}</span></p>
<h1 style="margin:0 0 18px;font-family:${POLICE};font-size:26px;line-height:1.2;font-weight:600;color:${COULEURS.encre};">${titre}</h1>
${paragraphes}${bouton}${notes}${details}
</td></tr>
<tr><td style="padding:24px 8px 0;">
${p(t.automatique, `font-size:12px;line-height:1.55;color:${COULEURS.discret};margin-bottom:10px;`)}
${p(t.pourquoi, `font-size:12px;line-height:1.55;color:${COULEURS.discret};margin-bottom:10px;`)}
<p style="margin:0;font-family:${POLICE};font-size:12px;line-height:1.55;color:${COULEURS.discret};"><strong style="color:${COULEURS.encre};">Cloison</strong> &nbsp;·&nbsp; ${echapper(t.signature)}<br>${pied}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { text: texteBrut(c, t), html }
}
