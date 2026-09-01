import { cn } from '@/lib/utils'

/** Pastille verte qui bat : signale un état vérifié en temps réel. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-live animate-pulse-dot inline-block size-[9px] shrink-0 rounded-full',
        className,
      )}
    />
  )
}
