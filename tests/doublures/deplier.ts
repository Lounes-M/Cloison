import { cloneElement, isValidElement, type ReactNode } from 'react'

/**
 * Deplie les composants serveur asynchrones d'un arbre React.
 *
 * Un test qui parcourt l'arbre rendu par une page ne voit d'un composant
 * serveur que son element, pas ce qu'il rend. Ceux que l'on nomme ici sont
 * executes, attendus, et remplaces par leur rendu, eux-memes deplies.
 */
export async function deplier(
  noeud: ReactNode,
  composants: readonly unknown[],
): Promise<ReactNode> {
  if (Array.isArray(noeud)) return Promise.all(noeud.map((n) => deplier(n, composants)))
  if (!isValidElement<{ children?: ReactNode }>(noeud)) return noeud
  if (composants.includes(noeud.type)) {
    const rendre = noeud.type as (props: unknown) => ReactNode | Promise<ReactNode>
    return deplier(await rendre(noeud.props), composants)
  }
  if (noeud.props.children === undefined) return noeud
  const enfants = await deplier(noeud.props.children, composants)
  return cloneElement(noeud, undefined, enfants)
}
