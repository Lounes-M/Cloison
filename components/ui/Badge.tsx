import { cn } from '@/lib/utils'

const tones = {
  sun: 'bg-sun text-ink',
  mint: 'bg-mint text-ink',
  sky: 'bg-sky text-ink',
  flame: 'bg-flame text-white',
  paper: 'bg-paper text-ink',
  ink: 'bg-ink text-sun',
} as const

type BadgeProps = {
  children: React.ReactNode
  tone?: keyof typeof tones
  /** `pill` pour un arrondi complet, `brut` pour le rayon carte. */
  shape?: 'pill' | 'brut'
  className?: string
}

export function Badge({ children, tone = 'sun', shape = 'brut', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'outlined inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold',
        shape === 'pill' ? 'rounded-full' : 'rounded-xl',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
