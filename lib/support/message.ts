import { z } from 'zod'
import {
  aideDossier as t,
  categoriesSupport,
  type EspaceSupport,
  type CategorieSupport,
} from '@/lib/content/support-dossier'
const parametres = z.object({
  adresse: z.email().max(254),
  reference: z.string().regex(/^[A-Za-z0-9]{8,32}$/),
  espace: z.enum(['agence', 'locataire', 'garant']),
  categorie: z.enum(['acces', 'suivi', 'paiement', 'depot', 'engagement', 'examen', 'equipe']),
})
export function preparerMessageSupport(entree: {
  adresse: string
  reference: string
  espace: EspaceSupport
  categorie: CategorieSupport
}) {
  const p = parametres.safeParse(entree)
  if (!p.success || !categoriesSupport[p.data.espace].includes(p.data.categorie)) return null
  const { adresse, reference, espace, categorie } = p.data
  const sujet = `${t.objet} - ${reference} - ${t.categories[categorie]}`
  const texte = `${t.reference} : ${reference}\n${t.parcours} : ${t.espaces[espace]}\n${t.categorie} : ${t.categories[categorie]}\n\n${t.invitation}`
  return {
    sujet,
    texte,
    lien: `mailto:${encodeURIComponent(adresse)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`,
  }
}
