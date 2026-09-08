import { FormulaireContinuite } from '@/components/forms/FormulaireContinuite'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { FormulaireGarant } from '@/components/forms/FormulaireGarant'
import { FormulaireLoyer } from '@/components/forms/FormulaireLoyer'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { espace, statuts } from '@/lib/content/locataire'
import { paiementLocataire, tarifs, euros } from '@/lib/content/tarifs'
import { payerMonDossier } from '@/lib/locataire/action-paiement'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Ton dossier',
  robots: { index: false, follow: false },
}

const tons = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame text-ink',
  paper: 'bg-paper',
} as const

/**
 * L'espace du locataire.
 *
 * Il voit ou en est son dossier, et rien d'autre. Ce n'est pas cette page qui
 * le garantit : c'est la base, qui ne lui rend ni ligne d'`engagements` ni
 * ligne de `pieces`, quelle que soit la requete. Cette page se contente de ne
 * pas les demander, et d'afficher un statut dont aucune valeur ne laisse
 * deduire un montant.
 */
export default async function PageLocataire({
  searchParams,
}: {
  searchParams: Promise<{ paiement?: string }>
}) {
  const { paiement } = await searchParams
  const porteur = await capaciteDepuisCookies()
  if (!porteur) redirect('/lien-invalide')
  if (porteur.capacite.partie !== 'locataire') redirect('/garant')

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { data: dossier, error: erreurDossier } = await supabase
    .from('dossiers')
    .select(
      'reference, statut, email_garant, expire_le, loyer_cents, paye_le, agence_id, demonstration, loyer_verrouille, garant_verrouille',
    )
    .eq('id', porteur.capacite.dossierId)
    .maybeSingle()

  if (erreurDossier) throw new Error('Chargement du dossier indisponible.')

  // Un jeton valide sans dossier lisible : le dossier a ete efface. Le lien est
  // donc perime, meme si sa signature tient encore.
  if (!dossier) redirect('/lien-invalide')

  const statut = statuts[String(dossier.statut)] ?? statuts.ouvert!
  const ouvert = ['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant'].includes(
    String(dossier.statut),
  )
  const garant = dossier.email_garant ? String(dossier.email_garant) : null

  // Ce que le locataire achete, c'est le lien de son garant. Un dossier ouvert
  // par une agence, ou une demonstration, n'attend rien de lui.
  const aRegler = !dossier.paye_le && !dossier.agence_id && !dossier.demonstration
  let prixDossier: number = tarifs.locataireCents
  let versionTarif: string = tarifs.versionLocataire
  if (aRegler) {
    const { data, error } = await supabase.rpc('mon_tarif_paiement')
    if (error || !Array.isArray(data) || data.length > 1) throw new Error('Tarif indisponible')
    if (data.length === 1) {
      const prix = data[0]
      if (
        !prix ||
        !Number.isSafeInteger(prix.montant_cents) ||
        prix.montant_cents < 1 ||
        prix.montant_cents > 100000000 ||
        prix.devise !== 'eur' ||
        typeof prix.tarif_version !== 'string' ||
        !/^[a-z0-9-]{1,64}$/.test(prix.tarif_version)
      )
        throw new Error('Tarif indisponible')
      prixDossier = prix.montant_cents
      versionTarif = prix.tarif_version
    }
  }
  const loyer =
    dossier.loyer_cents == null ? '' : (Number(dossier.loyer_cents) / 100).toLocaleString('fr-FR')
  const expire = new Date(String(dossier.expire_le)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="w-full max-w-[560px]">
      <p className="text-muted text-[13px] font-bold tracking-wide uppercase">
        {espace.reference} {String(dossier.reference)}
      </p>
      <h1 className="font-display mt-2 text-3xl uppercase md:text-4xl">{espace.titre}</h1>

      <div className={cn('outlined shadow-brut mt-8 rounded-[18px] p-6', tons[statut.ton])}>
        <p className="font-display text-xl uppercase">{statut.libelle}</p>
        <p className="mt-2 text-[15px] leading-relaxed font-medium">{statut.explication}</p>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl uppercase">{espace.loyerTitre}</h2>
        <p className="text-muted mt-2 mb-6 text-[14px] leading-relaxed font-medium">
          {espace.loyerAide}
        </p>
        {ouvert && !dossier.loyer_verrouille ? (
          <FormulaireLoyer dossierId={porteur.capacite.dossierId} loyerActuel={loyer} />
        ) : (
          <p className="text-sm">
            Loyer : {loyer} €. Ce montant est figé pour préserver la confidentialité de la
            déclaration du garant.
          </p>
        )}
        {ouvert && !dossier.agence_id ? (
          <FormulaireContinuite mode="agence" dossierId={porteur.capacite.dossierId} />
        ) : null}
      </section>

      {aRegler || dossier.paye_le ? (
        <section className="mt-10">
          <h2 className="font-display text-xl uppercase">{paiementLocataire.titre}</h2>
          {paiement === 'ok' && !dossier.paye_le ? (
            <p className="bg-sun outlined mt-4 rounded-xl px-4 py-3 text-[14px] font-semibold">
              {paiementLocataire.enAttente}
            </p>
          ) : null}
          {paiement === 'ok' && dossier.paye_le ? (
            <p className="bg-mint outlined mt-4 rounded-xl px-4 py-3 text-[14px] font-semibold">
              {paiementLocataire.confirme}
            </p>
          ) : null}
          {paiement === 'annule' ? (
            <p className="bg-paper outlined mt-4 rounded-xl px-4 py-3 text-[14px] font-semibold">
              {paiementLocataire.annule}
            </p>
          ) : null}
          {paiement === 'indisponible' ? (
            <p className="bg-flame outlined text-ink mt-4 rounded-xl px-4 py-3 text-[14px] font-semibold">
              {paiementLocataire.indisponible}
            </p>
          ) : null}

          {dossier.paye_le ? (
            <p className="text-muted mt-3 text-[14px] font-medium">
              {paiementLocataire.regle_le(
                new Date(String(dossier.paye_le)).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              )}
            </p>
          ) : (
            <div className="bg-sky outlined shadow-brut mt-4 rounded-[18px] p-6">
              <p className="font-display text-3xl">{euros(prixDossier)}</p>
              <p className="mt-2 text-[15px] leading-relaxed font-medium">
                {paiementLocataire.texte}
              </p>
              {/* La regle de non-remboursement s'affiche AVANT de payer : c'est
                  la decision prise le 4 septembre 2026, et sa condition. */}
              <p className="mt-3 text-[13px] leading-relaxed font-semibold">
                {paiementLocataire.regle}
              </p>
              <form action={payerMonDossier} className="mt-5">
                <input type="hidden" name="tarif_version" value={versionTarif} />
                <input type="hidden" name="montant_cents" value={prixDossier} />
                <input type="hidden" name="dossier" value={porteur.capacite.dossierId} />
                <button
                  type="submit"
                  className="press outlined bg-flame shadow-brut rounded-brut text-ink cursor-pointer px-8 py-4 text-[17px] font-bold"
                >
                  {paiementLocataire.boutonPour(prixDossier)}
                </button>
              </form>
            </div>
          )}
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl uppercase">{espace.garantTitre}</h2>
        <p className="text-muted mt-2 mb-6 text-[14px] leading-relaxed font-medium">
          {garant ? espace.garantDesigne(garant) : espace.garantAucun}
        </p>
        {aRegler ? (
          <p className="bg-paper outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
            {paiementLocataire.attente}
          </p>
        ) : ouvert ||
          (garant && ['transmis', 'signe', 'refuse'].includes(String(dossier.statut))) ? (
          <>
            <FormulaireGarant
              dossierId={porteur.capacite.dossierId}
              garantActuel={garant}
              verrouille={!ouvert || Boolean(dossier.garant_verrouille)}
            />
            {!ouvert ? <p className="mt-3 text-sm">{espace.garantRenouvellement}</p> : null}
            {dossier.garant_verrouille ? (
              <p className="mt-3 text-sm">
                Le garant invité reste associé à ce dossier. Pour désigner une autre personne, ouvre
                un nouveau dossier.
              </p>
            ) : null}
          </>
        ) : (
          <p>Ce dossier ne peut plus être modifié.</p>
        )}
      </section>

      <p className="text-muted mt-10 text-[13px] font-medium">{espace.expire(expire)}</p>
    </div>
  )
}
