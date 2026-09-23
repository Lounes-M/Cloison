import { z } from 'zod'
import { referenceFichierActe } from './archive-format'
export const contexteActe = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  dossier: z.uuid(),
  prenom: z.string().min(1).max(100),
  nom: z.string().min(1).max(100),
  email: z.email().max(254),
  telephone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  page: z.number().int().min(1).max(1000),
  x: z.number().int().min(0).max(10000),
  y: z.number().int().min(0).max(10000),
})
export const dossierActe = z.object({
  acte: z.object({
    id: z.uuid(),
    agence_id: z.uuid(),
    modele: z.string(),
    version_conditions: z.number().int().positive(),
    cle_scellee: z.string().regex(/^\\x[a-f0-9]+$/),
    contexte_chiffre: z.string().regex(/^\\x[a-f0-9]+$/),
    etape: z.enum([
      'preparation',
      'a_valider',
      'valide',
      'document',
      'signataire',
      'activation',
      'en_cours',
      'archive',
      'refuse',
      'incertain',
    ]),
    expire_signature: z.string(),
    conserver_jusqu_au: z.string(),
    document_fournisseur: z.uuid().nullable(),
    signataire_fournisseur: z.uuid().nullable(),
    operation: z.uuid().nullable(),
    operation_jusqu_au: z.string().nullable().optional(),
  }),
  demande: z.object({
    id: z.uuid(),
    environnement: z.enum(['sandbox', 'production']),
    etat: z.string(),
    empreinte_acte: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().nonnegative().optional(),
    source_dossier: z.uuid().optional(),
    reference_fournisseur: z.uuid().nullable().optional(),
    anomalie: z.boolean().optional(),
  }),
  fichiers: z.array(referenceFichierActe).max(3),
})
export type DossierActe = z.infer<typeof dossierActe>
export type ContexteActe = z.infer<typeof contexteActe>
