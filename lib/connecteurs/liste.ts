import 'server-only'
import type { ContexteAgence } from '@/lib/agences/contexte'

export async function listerConnecteurs(c: Extract<ContexteAgence, { etat: 'rattache' }>) {
  const { data, error } = await c.supabase
    .from('connecteurs_agence')
    .select('id,nom,cree_le,expire_le,revoque_le,utilise_le')
    .order('revoque_le', { ascending: false, nullsFirst: true })
    .order('expire_le', { ascending: false })
    .order('id')
    .limit(100)
  if (error || !data) throw new Error('Liste des connecteurs indisponible')
  const maintenant = Date.now()
  return data.map((k) => ({
    ...k,
    active: !k.revoque_le && Date.parse(k.expire_le) > maintenant,
  }))
}
