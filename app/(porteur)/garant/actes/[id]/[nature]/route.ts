import { telechargerActe } from '@/lib/signature/lecture'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string; nature: string }> },
) {
  const { id, nature } = await params
  return telechargerActe(requete, id, nature, 'garant')
}
