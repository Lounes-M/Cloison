'use server'

import { headers } from 'next/headers'
import { enregistrerDemande, notifierDemande } from '@/lib/agences/enregistrement'
import { DELAI_MINIMAL_MS, schemaDemandeAgence } from '@/lib/agences/schema'

export type EtatFormulaire = {
  statut: 'inactif' | 'succes' | 'erreur'
  message?: string
  /** Erreurs par champ, pour un affichage au bon endroit. */
  champs?: Record<string, string>
  /**
   * Ce que l'agence avait saisi. Reinjecte dans le formulaire en cas d'erreur :
   * une panne passagere ne doit pas lui faire retaper quatre champs.
   */
  valeurs?: Record<string, string>
}

/** Fenetre glissante de limitation de debit. */
const FENETRE_MS = 10 * 60 * 1000
const MAX_PAR_FENETRE = 5

/**
 * Limitation de debit en memoire.
 *
 * Honnete sur sa portee : chaque instance serverless a la sienne, donc elle ne
 * borne pas un attaquant reparti sur plusieurs instances. Elle suffit contre le
 * bruit ordinaire (double-clic, script naif, remplissage repete), et c'est ce
 * qu'on protege ici : une table sans lecture publique et sans donnee sensible.
 * Le jour ou une vraie limite s'impose (phase 3, sur les liens d'acces), elle
 * se fera avec un magasin partage.
 */
const tentatives = new Map<string, number[]>()

function tropDeTentatives(cle: string): boolean {
  const maintenant = Date.now()
  const recentes = (tentatives.get(cle) ?? []).filter((t) => maintenant - t < FENETRE_MS)

  if (recentes.length >= MAX_PAR_FENETRE) {
    tentatives.set(cle, recentes)
    return true
  }

  recentes.push(maintenant)
  tentatives.set(cle, recentes)

  // La table ne doit pas grossir indefiniment sur une instance longue duree.
  if (tentatives.size > 5000) {
    for (const [autre, dates] of tentatives) {
      if (dates.every((t) => maintenant - t >= FENETRE_MS)) tentatives.delete(autre)
    }
  }

  return false
}

async function identifiantAppelant(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnu'
  )
}

export async function envoyerDemandeAgence(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  // Conserve tel quel : c'est ce qu'on reaffichera si quelque chose echoue.
  const saisie: Record<string, string> = {
    nomAgence: String(donnees.get('nomAgence') ?? ''),
    email: String(donnees.get('email') ?? ''),
    ville: String(donnees.get('ville') ?? ''),
    dossiersParAn: String(donnees.get('dossiersParAn') ?? ''),
    message: String(donnees.get('message') ?? ''),
  }

  const analyse = schemaDemandeAgence.safeParse({
    nomAgence: donnees.get('nomAgence'),
    email: donnees.get('email'),
    ville: donnees.get('ville'),
    dossiersParAn: donnees.get('dossiersParAn'),
    message: donnees.get('message') || undefined,
    siteWeb: donnees.get('siteWeb') || undefined,
    affichéÀ: donnees.get('affichéÀ') || undefined,
  })

  if (!analyse.success) {
    const champs: Record<string, string> = {}
    for (const probleme of analyse.error.issues) {
      const champ = probleme.path[0]
      if (typeof champ === 'string' && !champs[champ]) champs[champ] = probleme.message
    }
    return {
      statut: 'erreur',
      message: 'Quelques champs sont à corriger.',
      champs,
      valeurs: saisie,
    }
  }

  const demande = analyse.data

  // Anti-robot. Les deux signaux renvoient un succes de facade : signaler le
  // rejet apprendrait au script comment passer.
  const remplissageAutomatique = Boolean(demande.siteWeb)
  const envoiTropRapide =
    typeof demande.affichéÀ === 'number' && Date.now() - demande.affichéÀ < DELAI_MINIMAL_MS

  if (remplissageAutomatique || envoiTropRapide) {
    return { statut: 'succes' }
  }

  if (tropDeTentatives(await identifiantAppelant())) {
    return {
      statut: 'erreur',
      message: 'Trop de tentatives. Réessaie dans quelques minutes.',
      valeurs: saisie,
    }
  }

  // Tout ce qui suit touche des services externes. Une action serveur qui leve
  // renvoie un 500 et fait disparaitre le formulaire : l'agence perd sa saisie
  // et ne comprend pas pourquoi. Variable manquante, Supabase indisponible,
  // reseau coupe : tout doit ressortir en message lisible.
  try {
    const resultat = await enregistrerDemande(demande, 'formulaire-agences')

    if (resultat.statut === 'echec') {
      return {
        statut: 'erreur',
        message: "Nous n'avons pas pu enregistrer ta demande. Réessaie dans un instant.",
        valeurs: saisie,
      }
    }

    // Une agence qui envoie deux fois n'a pas commis d'erreur : meme reponse,
    // mais pas de seconde notification.
    if (resultat.statut === 'enregistree') {
      await notifierDemande(demande)
    }

    return { statut: 'succes' }
  } catch (erreur) {
    console.error('[demande-agence] échec inattendu', erreur)
    return {
      statut: 'erreur',
      message: "Nous n'avons pas pu enregistrer ta demande. Réessaie dans un instant.",
      valeurs: saisie,
    }
  }
}
