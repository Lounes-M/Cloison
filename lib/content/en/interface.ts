/** La part de `interface.ts` que le site public affiche, en anglais. */
export const interfaceEspace = {
  principal: 'Skip to content',
  signature: 'One shared file. Separate spaces.',
  ouverture: 'Start here',
  retrouver: 'Already have a file?',
  connexion: 'Welcome back',
  connexionTitre: 'Your agency space',
  connexionTexte: 'No password. Get a sign-in link at your work address to find your files again.',
  parcours: 'Three roles. One rule: everyone in their place.',
  roles: [
    { nom: 'Tenant', texte: 'You open the file and follow its progress.', ton: 'mint' },
    { nom: 'Guarantor', texte: 'You upload your documents in your private space.', ton: 'sun' },
    { nom: 'Agency', texte: 'You review the file in your own space.', ton: 'sky' },
  ],
} as const
