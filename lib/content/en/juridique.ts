/**
 * Les pages juridiques en anglais.
 *
 * Une traduction de courtoisie : la version francaise fait foi, et la page le
 * dit. La forme suit `lib/content/juridique.ts` ; une regle changee la-bas
 * doit l'etre ici dans la meme PR.
 */

import { prixLocataire } from './tarifs'

export const juridique = {
  aCompleter: 'To be completed',
  avertissementIncomplet: 'Some information about the publisher is being published.',
  miseAJour: 'Last updated: 21 October 2026.',
  navigation: 'Legal information',
  liens: {
    mentions: { label: 'Legal notice', href: '/mentions-legales' },
    confidentialite: { label: 'Privacy', href: '/confidentialite' },
    conditions: { label: 'Terms', href: '/conditions' },
  },
  traduction:
    'This page is a translation provided for convenience. The French version is the one that applies.',
} as const

export const mentionTva = {
  ttc: 'Price inclusive of all taxes.',
  franchise: 'VAT not applicable, article 293 B of the French General Tax Code.',
} as const

export const mentionsLegales = {
  titre: 'Legal notice',
  description: 'Publisher, publication director and hosting providers of the Cloison website.',
  editeur: 'Publisher',
  libelles: {
    denomination: 'Company name',
    forme: 'Legal form',
    capital: 'Share capital',
    siren: 'SIREN',
    rcs: 'Registration',
    tva: 'EU VAT number',
    adresse: 'Registered office',
    telephone: 'Phone',
    courriel: 'Contact',
    directeurPublication: 'Publication director',
  },
  hebergement: 'Hosting',
  hebergeurs: [
    {
      nom: 'Vercel Inc.',
      role: 'Application and server functions, run in the Frankfurt region (European Union).',
      adresse: '440 N Barranca Ave #4133, Covina, CA 91723, United States',
      site: 'https://vercel.com',
    },
    {
      nom: 'Supabase, Inc.',
      role: 'Database, authentication and storage of the encrypted documents, in a project located in the European Union.',
      adresse: null,
      site: 'https://supabase.com',
    },
  ],
  autres: 'Ownership and reporting',
  propriete:
    'The code, texts, brand and graphic elements of Cloison are protected. Browsing the site grants no licence.',
  signalement:
    'To report content or a vulnerability, write to the contact address above. Vulnerabilities can also be reported privately from the security page of the public repository.',
} as const

type Section = { id: string; titre: string; paragraphes: readonly string[] }

export const confidentialite = {
  titre: 'Privacy',
  description:
    'What Cloison does with the data of tenants, guarantors and agencies, for how long and with whom.',
  introduction:
    'Cloison separates three spaces: the tenant follows their file, the guarantor uploads their documents on their side, and the agency views the complete file. This page says which data each person entrusts, why, for how long, and how to exercise your rights.',
  responsable: (denomination: string) =>
    `The data controller is ${denomination}, publisher of Cloison. The agency to which a file is sent decides alone what happens to the application: for that decision and for what it keeps in its own tools, it is the controller of its own processing.`,
  sections: [
    {
      id: 'donnees',
      titre: 'The data processed',
      paragraphes: [
        'Tenant: email address, name, rent amount, file status and, if you pay for the file, the payment record sent by Stripe. Cloison never receives your card number.',
        'Guarantor: email address, last name, first name, postal address, declared net monthly income, scope of the commitment, the guarantee statement you write yourself, and the supporting documents you upload (payslips, tax notice, identity document, proof of address, employment contract).',
        'Agency: work email address of each team member, role in the agency and, to verify the agency, its SIREN number and its professional licence number.',
        'For everyone: a log of viewings (who opened what, and when) and, against abuse, fingerprints of the IP address and email address calculated with a secret key, without the address itself.',
        'No health, opinion or biometric data is requested. The identity document is neither read automatically nor compared with a face.',
      ],
    },
    {
      id: 'finalites',
      titre: 'Why, and on what basis',
      paragraphes: [
        'Building a rental guarantee file at the tenant’s request and sending it to the agency they chose: pre-contractual steps taken at their request. For the guarantor, who uploads their documents personally: the agency’s legitimate interest in checking the guarantee offered to it.',
        'Providing the agency space and billing the service: performance of the contract with the agency.',
        'Collecting the tenant’s payment and keeping the accounts: performance of the contract and legal obligations.',
        'Securing the service, limiting abuse and keeping a trace of viewings: legitimate interest of Cloison and of the people whose documents are protected.',
      ],
    },
    {
      id: 'destinataires',
      titre: 'Who sees what',
      paragraphes: [
        'The tenant never sees the guarantor’s documents, income or ratio: the database refuses it, not just the screen.',
        'The agency linked to the file views the documents as images, watermarked with the name of the person opening them. Every opening is written to the log, which the guarantor can read. The agency never receives the original file.',
        'Documents are encrypted before being stored. The key that protects them is kept with a different hosting provider from the documents themselves.',
        'Cloison staff only open a document to answer a request to exercise your rights or to meet a legal obligation.',
      ],
    },
    {
      id: 'durees',
      titre: 'For how long',
      paragraphes: [
        'A file with no document is deleted 30 days after it is opened. A file with documents is deleted three months after it is opened: documents, encryption keys, commitments and the log of viewings disappear together.',
        'An access link is valid for seven days at most, within the life of the file, and sending it again revokes the previous one. A draft commitment is kept for seven days at most.',
        'The history of access changes within an agency is kept for 90 days. The fingerprints used against abuse only last for their window, one hour at most.',
        'Accounting entries linked to a payment are kept for ten years, as the law requires.',
      ],
    },
    {
      id: 'prestataires',
      titre: 'Where, and with which providers',
      paragraphes: [
        'Vercel runs the application in the Frankfurt region. Supabase hosts the database and the encrypted documents in the European Union. Resend delivers the emails. Stripe processes the tenant’s card payment.',
        'These providers act on Cloison’s instructions, under data processing agreements. Where a provider falls under a country outside the European Union, the transfer is governed by the European Commission’s standard contractual clauses or by the EU-US Data Privacy Framework.',
      ],
    },
  ] satisfies readonly Section[],
  sauvegardes: (jours: number) =>
    `Technical backups are kept for ${jours} days at most, then overwritten: deleted data also disappears from the backups no later than ${jours} days after its deletion. They are only used to restore the service after an incident, never to view a deleted file.`,
  facultatifs: {
    signature: {
      docage:
        'Electronic signature of the guarantee deed is entrusted to Docage, a French electronic signature provider. The signed deed is kept for the period stated at the time of signing, separate from that of the supporting documents.',
      youtrust:
        'Electronic signature of the guarantee deed is entrusted to Youtrust, an electronic signature provider hosted in France. The signed deed is kept for the period stated at the time of signing, separate from that of the supporting documents.',
    },
    ocr: 'At the explicit request of an agency, a document may be read by a text recognition service (OpenRouter) to make it easier to review. This reading makes no decision and is never triggered automatically.',
  },
  droits: {
    titre: 'Your rights',
    paragraphes: [
      'You can ask for access to your data, its correction, its deletion, its portability or the restriction of its processing, and object to processing based on legitimate interest. The guarantor can retrieve their own documents exactly as they uploaded them.',
      'You receive an answer within one month, which the law allows to be extended by two months for a complex request; you are then told before the end of the first month. No proof of identity is requested as a matter of principle.',
    ],
    contact: (courriel: string) => `For any request: ${courriel}.`,
    cnil: 'If you believe your rights are not respected, you can lodge a complaint with the CNIL, the French data protection authority.',
    lienCnil: 'https://www.cnil.fr/en/complaints',
  },
} as const

export const conditions = {
  titre: 'Terms',
  description:
    'What Cloison provides to the tenant, the guarantor and the agency, and what each of them undertakes to do.',
  introduction:
    'Cloison prepares a rental guarantee file in three separate spaces. It passes on a file: it does not decide on the application, guarantees neither a home nor a guarantor’s ability to pay, and does not draft the guarantee deed.',
  sections: [
    {
      id: 'locataire',
      titre: 'The tenant',
      paragraphes: [
        'You get a file valid for three months from the day it is opened, in which your guarantor uploads their documents without you seeing them, and whose progress you follow.',
        `A file you open yourself costs ${prixLocataire}, once, paid by card before your guarantor’s link is sent. A file opened by an agency costs you nothing.`,
        'You provide an email address you have access to, name as guarantor a person who has agreed to be one, and enter an accurate rent. Your access link is personal: do not pass it on.',
      ],
    },
    {
      id: 'retractation',
      titre: 'The tenant’s right of withdrawal',
      paragraphes: [
        'You have fourteen days from payment to withdraw, without giving a reason, by writing to the contact address given in the legal notice.',
        'When you pay, you expressly ask for the service to start straight away, so that your guarantor receives their link without waiting. If you then withdraw within the fourteen days, you are refunded the price, minus the share matching the time already elapsed out of the three months of the file. The refund is made within fourteen days, by the payment method used.',
        'After that period, the price is kept even if the file expires without a decision from the agency: you pay for three months of vault, not for a result.',
      ],
    },
    {
      id: 'garant',
      titre: 'The guarantor',
      paragraphes: [
        'You pay nothing, under any circumstances.',
        'You upload documents that are genuine and that concern you, declare an accurate income and write your guarantee statement yourself. It is never pre-filled.',
        'The guarantee deed you may sign is a contract between you and the landlord, separate from these terms. It binds you beyond the life of the file.',
      ],
    },
    {
      id: 'agence',
      titre: 'The agency',
      paragraphes: [
        'Viewing a file is free, and team members are unlimited. A team member joins the agency space with an address on its domain, after approval by an administrator. Real files can be opened once the agency’s SIREN number and professional licence have been verified.',
        'The agency only views the files sent to it, as part of a real letting, and does not pass the documents on. The ratio shown is calculated from a declared income: checking the documents is up to the agency.',
        'Cloison may suspend an agency’s access in the event of abnormal viewing, documents being passed on, or an inaccurate declaration.',
      ],
    },
    {
      id: 'responsabilite',
      titre: 'Availability and liability',
      paragraphes: [
        'The service may be interrupted for maintenance. Cloison implements the measures described on the Privacy page to protect the documents; its liability does not cover the decision made by the agency or the content of the documents uploaded.',
      ],
    },
    {
      id: 'litiges',
      titre: 'Disputes',
      paragraphes: [
        'These terms are governed by French law. If there is a problem, write first to the contact address: you receive an answer within one month.',
      ],
    },
  ] satisfies readonly Section[],
  mediateur: (nom: string) =>
    `If you are a consumer and your complaint has not been resolved, you can use the consumer mediator free of charge: ${nom}.`,
  tribunaux:
    'You can also bring the matter before the competent courts; a consumer can use the court of their place of residence.',
} as const
