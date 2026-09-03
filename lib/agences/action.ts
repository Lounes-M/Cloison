'use server'

import { headers } from 'next/headers'
import { consommerDebit } from '@/lib/acces/debit'
import { clientAnonyme } from '@/lib/acces/session'
import { enregistrerDemande, notifierDemande } from './enregistrement'
import { DELAI_MINIMAL_MS, schemaDemandeAgence } from './schema'

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

  // Tout ce qui suit touche des services externes. Une action serveur qui leve
  // renvoie un 500 et fait disparaitre le formulaire : l'agence perd sa saisie
  // et ne comprend pas pourquoi. Variable manquante, Supabase indisponible,
  // reseau coupe : tout doit ressortir en message lisible.
  try {
    // La limite est comptee dans Postgres, partagee par toutes les instances :
    // celle qui vivait ici en memoire ne bornait qu'une fonction serverless a
    // la fois. Elle est a l'interieur du `try` a dessein, parce qu'elle depend
    // desormais de `CLE_MAITRESSE` : une variable absente doit rendre un
    // message lisible, pas faire disparaitre le formulaire.
    if (!(await consommerDebit(clientAnonyme(), 'demande_agence', await identifiantAppelant()))) {
      return {
        statut: 'erreur',
        message: 'Trop de tentatives. Réessaie dans quelques minutes.',
        valeurs: saisie,
      }
    }

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
