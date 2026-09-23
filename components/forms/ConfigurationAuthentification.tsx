import { securite } from '@/lib/content/securite'

/** Le QR reste une image ; la cle n'est conservee que dans l'etat du formulaire. */
export function ConfigurationAuthentification({ qr, secret }: { qr: string; secret?: string }) {
  return (
    <div className="configuration-authentification">
      <p className="text-sm font-bold">{securite.scanner}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        width={240}
        height={240}
        src={qr.startsWith('data:') ? qr : `data:image/svg+xml,${encodeURIComponent(qr)}`}
        alt={securite.qr}
        className="mx-auto h-auto w-full max-w-[240px] rounded-lg"
      />
      {secret ? (
        <details className="aide-espace w-full">
          <summary>{securite.manuel}</summary>
          <p className="text-muted mb-3 text-sm leading-relaxed">{securite.aideManuelle}</p>
          <code className="border-ink/15 bg-paper block rounded-lg border p-3 text-sm break-all select-all">
            {secret}
          </code>
        </details>
      ) : null}
    </div>
  )
}
