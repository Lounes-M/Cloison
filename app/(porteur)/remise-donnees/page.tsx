import type { Metadata } from 'next'
import { Remise } from './remise'
export const metadata: Metadata = {
  title: 'Vos données personnelles',
  robots: { index: false, follow: false },
}
export default function Page() {
  return <Remise />
}
