/**
 * Tout le texte de la page d'accueil.
 * Le contenu vit ici, la mise en forme vit dans `components/sections/`.
 * Pour changer une accroche, on n'ouvre pas un composant.
 */

export const hero = {
  eyebrow: 'La caution de A à Z',
  badges: [
    { label: 'pas de compte ✓', tone: 'sun', position: 'top-[70px] left-[6%]', tilt: -8, delay: 0 },
    {
      label: 'pas de papier ✓',
      tone: 'mint',
      position: 'top-[200px] left-[3%]',
      tilt: 5,
      delay: 0.8,
    },
    {
      label: 'pas de relance ✓',
      tone: 'sky',
      position: 'top-[100px] right-[5%]',
      tilt: 6,
      delay: 0.4,
    },
  ],
  liveBadge: { label: 'garant éligible', position: 'top-[240px] right-[8%]', tilt: -5, delay: 1.2 },
  subtitle:
    "Le garant dépose ses pièces chez lui. Le locataire voit un feu vert. L'agence signe. Personne ne voit ce qu'il ne doit pas voir.",
  primaryCta: 'Créer mon dossier',
  secondaryCta: 'Je suis une agence',
} as const

export const marqueeItems = [
  'Trois personnes gênées',
  'Zéro processus',
  'Des documents qui traînent partout',
  'Plus jamais ça',
] as const

export const problem = {
  eyebrow: 'Le problème',
  conversation: {
    from: 'WhatsApp — Tonton Marc',
    messages: ['📎 bulletin_paie_mars.pdf', '📎 avis_imposition_2025.pdf', "c'est bon là ?? 😅"],
    stamp: 'Rescanné. Refait.',
  },
  body: "Louer à Paris, Lyon ou Bordeaux quand tu as 25 ans, c'est presque toujours un proche qui se porte caution. Un oncle, un ami, la belle-famille. Et aujourd'hui, ça donne : ses bulletins de paie sur ton WhatsApp, son avis d'imposition dans ton Drive, un acte de caution imprimé, mal rempli, rescanné, refait.",
  punchline:
    'Trois personnes gênées. Zéro processus. Et des documents sensibles qui traînent partout.',
} as const

/** Les trois espaces cloisonnés — le cœur du produit. */
export const spaces = [
  {
    id: 'garant',
    step: 1,
    title: 'Le garant',
    tone: 'sun',
    body: 'Il dépose ses pièces seul, chez lui, dans son espace. Il voit ce qu\u2019il couvre, combien, jusqu\u2019à quand.',
    footnote: { left: 'Couvre : loyer + charges', right: '🔒' },
  },
  {
    id: 'locataire',
    step: 2,
    title: 'Le locataire',
    tone: 'mint',
    body: "Il voit un feu vert : dossier complet, garant éligible. Rien d'autre, pas les montants.",
    footnote: { left: 'Dossier complet · Garant éligible', live: true },
  },
  {
    id: 'agence',
    step: 3,
    title: "L'agence",
    tone: 'sky',
    body: 'Elle ouvre un lien : pièces filigranées, ratio de solvabilité calculé, acte de cautionnement pré-rempli, signé électroniquement.',
    footnote: { left: 'Acte signé ✍️', right: 'Ratio : ✓' },
  },
] as const

export const product = {
  headline: ['Chacun sa vue.', "Rien d'autre."],
  intro:
    'Cloison prend la caution de A à Z. Trois espaces cloisonnés, une seule signature au bout.',
  outro: 'Pas de compte, pas de papier, pas de relance.',
  outroHighlight: "C'est tout.",
} as const

export const positioning = {
  headline: ['On ne remplace', 'personne.'],
  subtitle: "C'est hors de leur périmètre, ils l'écrivent eux-mêmes.",
  players: [
    {
      name: 'Visale',
      role: 'se porte garant',
      body: 'Visale se porte garant, on ne le fait pas.',
    },
    {
      name: 'Garantme',
      role: 'remplace ton oncle',
      body: 'Garantme remplace ton oncle, on le protège.',
    },
    {
      name: 'DossierFacile',
      role: "s'arrête au dossier",
      body: 'DossierFacile labellise le dossier du locataire et s\u2019arrête là ; nous, on prend le garant et on va jusqu\u2019à la signature.',
    },
  ],
} as const

export const pricing = {
  headline: ['Qui paie', 'quoi ?'],
  plans: [
    {
      audience: 'Le locataire',
      price: 'Quelques euros',
      detail: 'une fois, pour un dossier valable trois mois',
    },
    {
      audience: "L'agence",
      price: 'Gratuit pour lire',
      detail: 'payant pour signer et archiver',
    },
  ],
  goldenRule: {
    tag: "Règle d'or",
    audience: 'Le garant',
    price: 'Jamais.',
    detail: 'Sinon ça ne part pas.',
  },
} as const

export const whyNow = {
  eyebrow: '⚡ Pourquoi maintenant',
  body: 'La caution se signe électroniquement depuis la loi ELAN, les agences ont déjà leur outil de signature, et',
  emphasis: 'personne n\u2019a encore branché le garant dessus.',
} as const

export const goToMarket = {
  eyebrow: 'Par où on commence',
  body: 'On démarre par les agences, pas par les locataires. Une agence convaincue, c\u2019est cent dossiers par an.',
  metrics: [
    { value: '3', label: 'villes tendues' },
    { value: '20', label: 'agences pilotes' },
    { value: '6', label: 'mois' },
  ],
} as const

export const vision = {
  headline: [
    'La location, c\u2019est le premier cas.',
    'Le produit, c\u2019est',
    'le coffre à trois clés.',
  ],
  body: "Quelqu'un s'engage pour toi sans te montrer ses papiers. Même gêne, même besoin, même coffre.",
  useCases: [
    { label: 'Caution bancaire', tone: 'paper', tilt: -2 },
    { label: 'Hébergeant pour un visa', tone: 'sun', tilt: 1.5 },
    { label: 'Parents pour le Crous', tone: 'mint', tilt: -1 },
    { label: 'Grands-parents pour la crèche', tone: 'sky', tilt: 2 },
  ],
  cta: 'Créer mon dossier',
} as const
