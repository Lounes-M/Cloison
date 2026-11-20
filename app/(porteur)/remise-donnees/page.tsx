import { Remise } from './remise'
import { titres as titresEn } from '@/lib/content/en/titres'
import { titres as titresFr } from '@/lib/content/titres'
import { titreEspace } from '@/lib/langue-espace'
export const generateMetadata = () => titreEspace(titresFr.remise, titresEn.remise)
export default function Page() {
  return <Remise />
}
