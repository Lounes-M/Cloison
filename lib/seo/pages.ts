import type { Metadata } from 'next'

import { heroAgences as agencesFr } from '@/lib/content/agences'
import { heroAgences as agencesEn } from '@/lib/content/en/agences'
import { porte as porteEn } from '@/lib/content/en/formulaires'
import * as juridiqueEn from '@/lib/content/en/juridique'
import { questions as questionsEn } from '@/lib/content/en/questions'
import { site as siteEn } from '@/lib/content/en/site'
import * as juridiqueFr from '@/lib/content/juridique'
import { porte as porteFr } from '@/lib/content/locataire'
import { questions as questionsFr } from '@/lib/content/questions'
import { heroIa as iaEn } from '@/lib/content/en/ia'
import { heroIa as iaFr } from '@/lib/content/ia'
import type { Langue } from '@/lib/i18n'
import { alternates } from '@/lib/seo/langues'
import { site as siteFr } from '@/lib/site'

type Cle =
  | 'accueil'
  | 'agences'
  | 'questions'
  | 'ia'
  | 'demarrer'
  | 'connexion'
  | 'conditions'
  | 'confidentialite'
  | 'mentions'

type Fiche = { chemin: string; titre?: string; description: string; indexee?: false }

const FICHES: Record<Langue, Record<Cle, Fiche>> = {
  fr: {
    accueil: { chemin: '/', description: siteFr.description },
    agences: { chemin: '/agences', titre: 'Agences', description: agencesFr.sousTitre },
    questions: {
      chemin: '/questions',
      titre: questionsFr.titre,
      description: questionsFr.description,
    },
    ia: {
      chemin: '/intelligence-artificielle',
      titre: iaFr.eyebrow,
      description: iaFr.description,
    },
    demarrer: { chemin: '/demarrer', titre: 'Créer mon dossier', description: porteFr.sousTitre },
    connexion: {
      chemin: '/connexion',
      titre: 'Connexion',
      description: 'Accédez à votre espace agence Cloison.',
      // Une page de connexion n'a rien a faire dans un index de moteur.
      indexee: false,
    },
    conditions: {
      chemin: '/conditions',
      titre: juridiqueFr.conditions.titre,
      description: juridiqueFr.conditions.description,
    },
    confidentialite: {
      chemin: '/confidentialite',
      titre: juridiqueFr.confidentialite.titre,
      description: juridiqueFr.confidentialite.description,
    },
    mentions: {
      chemin: '/mentions-legales',
      titre: juridiqueFr.mentionsLegales.titre,
      description: juridiqueFr.mentionsLegales.description,
    },
  },
  en: {
    accueil: { chemin: '/', description: siteEn.description },
    agences: { chemin: '/agences', titre: 'Agencies', description: agencesEn.description },
    questions: {
      chemin: '/questions',
      titre: questionsEn.titre,
      description: questionsEn.description,
    },
    ia: {
      chemin: '/intelligence-artificielle',
      titre: iaEn.eyebrow,
      description: iaEn.description,
    },
    demarrer: { chemin: '/demarrer', titre: 'Create my file', description: porteEn.sousTitre },
    connexion: {
      chemin: '/connexion',
      titre: 'Sign in',
      description: 'Access your Cloison agency space.',
      indexee: false,
    },
    conditions: {
      chemin: '/conditions',
      titre: juridiqueEn.conditions.titre,
      description: juridiqueEn.conditions.description,
    },
    confidentialite: {
      chemin: '/confidentialite',
      titre: juridiqueEn.confidentialite.titre,
      description: juridiqueEn.confidentialite.description,
    },
    mentions: {
      chemin: '/mentions-legales',
      titre: juridiqueEn.mentionsLegales.titre,
      description: juridiqueEn.mentionsLegales.description,
    },
  },
}

/** Les metadonnees d'une page publique dans la langue demandee. */
export function metadonnees(langue: Langue, cle: Cle): Metadata {
  const fiche = FICHES[langue][cle]
  const site = langue === 'en' ? siteEn : siteFr
  const titre = fiche.titre ?? `${site.name} · ${site.tagline}`
  return {
    // L'accueil garde le titre complet ; les autres pages passent par le gabarit.
    title: fiche.titre ?? { absolute: titre },
    description: fiche.description,
    alternates: alternates(langue, fiche.chemin),
    openGraph: {
      type: 'website',
      title: titre,
      description: fiche.description,
      locale: site.locale,
      siteName: site.name,
    },
    ...(fiche.indexee === false ? { robots: { index: false, follow: false } } : {}),
  }
}
