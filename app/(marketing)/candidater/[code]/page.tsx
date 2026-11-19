import { PageCandidater, metadonneesCandidater } from '@/components/pages/PageCandidater'

type Parametres = { params: Promise<{ code: string }> }

export function generateMetadata({ params }: Parametres) {
  return metadonneesCandidater(params, 'fr')
}

export default function Page({ params }: Parametres) {
  return <PageCandidater langue="fr" params={params} />
}
