import { DetailActe } from '@/components/dossiers/DetailActe'
export const metadata = { title: 'Signature', robots: { index: false, follow: false } }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DetailActe id={id} partie="agence" />
}
