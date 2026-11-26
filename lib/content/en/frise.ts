import type { Textes } from '@/lib/i18n'
import type { frise as Fr } from '../frise'

export const frise: Textes<typeof Fr> = {
  etats: {
    fait: 'done',
    encours: 'in progress',
    avenir: 'to come',
    arrete: 'stopped',
  },
  locataire: {
    titre: 'Where your file stands',
    etapes: {
      ouverture: 'File opened',
      garant: 'Guarantor named',
      garantADesigner: 'Guarantor to name',
      depot: 'Your guarantor’s upload',
      rattachement: 'Link to your agency',
      decision: 'Agency’s decision',
      signature: 'Deed signed',
    },
  },
  garant: {
    titre: 'Where the file stands',
    etapes: {
      invitation: 'Invitation received',
      depot: 'Your documents and your declaration',
      attenteAgence: 'Waiting for an agency',
      decision: 'Agency’s decision',
      signature: 'Deed signed',
    },
  },
}
