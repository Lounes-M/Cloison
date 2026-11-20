import { DetailActe } from '@/components/dossiers/DetailActe'
import { titres as titresEn } from '@/lib/content/en/titres'
import { titres as titresFr } from '@/lib/content/titres'
import { titreEspace } from '@/lib/langue-espace'
export const generateMetadata = () => titreEspace(titresFr.suiviSignature, titresEn.suiviSignature)
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DetailActe id={id} partie="garant" />
}
