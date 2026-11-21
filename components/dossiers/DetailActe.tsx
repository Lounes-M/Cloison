import { FriseAvancement } from '@/components/dossiers/FriseAvancement'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import type { Etape } from '@/lib/dossiers/frise'
import { Icone } from '@/components/ui/Icone'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { accesActe } from '@/lib/signature/lecture'
import { ouvrirContexteActe } from '@/lib/signature/parcours'
import { ValidationActe, RepriseActe } from '@/components/forms/FormulaireActe'
import { signature as tFr } from '@/lib/content/signature'
import { signature as tEn } from '@/lib/content/en/signature'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
export async function DetailActe({ id, partie }: { id: string; partie: 'agence' | 'garant' }) {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

  const acces = await accesActe(id, partie).catch(() => null)
  if (!acces) notFound()
  const { d, dossier } = acces
  const { cle, contexte } = ouvrirContexteActe(d)
  cle.fill(0)
  // Quatre grands temps, pour situer l'acte d'un coup d'oeil : les etapes
  // techniques de l'envoi en signature sont regroupees dans le troisieme.
  const rangs: Record<string, number> = { preparation: 0, a_valider: 1, archive: 4 }
  const rang = rangs[d.acte.etape] ?? 2
  const refuse = d.acte.etape === 'refuse'
  const parcours: Etape[] = t.parcours.etapes.map((titre, i) => ({
    titre,
    etat: refuse
      ? i === 0
        ? 'fait'
        : i === 1
          ? 'arrete'
          : 'avenir'
      : i < rang
        ? 'fait'
        : i === rang
          ? 'encours'
          : 'avenir',
  }))
  return (
    <div className="page-espace w-full max-w-[880px]">
      <Link className="lien-retour" href={partie === 'agence' ? '/espace' : '/garant'}>
        {partie === 'agence' ? t.retour : t.retourGarant}
      </Link>
      <EnteteEspace
        titre={t.titre}
        etiquette={t.etiquette}
        ton={partie === 'garant' ? 'sun' : 'sky'}
      />
      {d.demande.environnement === 'sandbox' ? (
        <p className="border-sun bg-sun/15 mb-5 rounded-r-xl border-l-4 px-4 py-3 text-sm leading-relaxed font-semibold">
          {t.sandbox}
        </p>
      ) : null}
      {d.acte.etape === 'archive' ? (
        <p role="status" className="message-succes mb-5 flex items-start gap-3">
          <Icone nom="coche" className="text-cobalt mt-0.5 size-5 shrink-0" />
          {partie === 'agence' ? t.parcours.termine : t.parcours.termineGarant}
        </p>
      ) : null}
      {refuse ? (
        <p role="status" className="message-erreur mb-5">
          {t.parcours.refuse}
        </p>
      ) : null}
      <FriseAvancement titre={t.parcours.titre} etapes={parcours} />
      <dl className="panneau-espace mt-6 grid gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted text-xs font-semibold">{t.modele}</dt>
          <dd className="mt-2 font-bold break-words">{d.acte.modele}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted text-xs font-semibold">{t.etat}</dt>
          <dd className="mt-2 text-sm leading-relaxed font-semibold">
            {d.acte.operation
              ? acces.operationEnCours
                ? t.traitement
                : t.etapes.incertain
              : t.etapes[d.acte.etape]}{' '}
            · {t.fournisseur[d.demande.etat] ?? t.indisponible}
          </dd>
        </div>
        <div className="border-ink/15 border-t pt-4 sm:col-span-2">
          <dt className="text-muted text-xs font-semibold">{t.telephoneGarant}</dt>
          <dd className="mt-2 font-semibold tabular-nums">{contexte.telephone}</dd>
        </div>
      </dl>
      <ul aria-label={t.documents} className="mt-6 grid gap-3 sm:grid-cols-2">
        {d.fichiers
          .filter((f) => f.confirme && (f.nature === 'projet' || d.acte.etape === 'archive'))
          .map((f) => (
            <li key={f.id}>
              <a
                className="lien-espace h-full w-full justify-start gap-3 py-4 text-left"
                href={`/${partie === 'agence' ? 'espace' : 'garant'}/actes/${id}/${f.nature}`}
              >
                <Icone nom="fichier" className="text-cobalt size-5" />
                {t[f.nature === 'projet' ? 'consulter' : f.nature]}
              </a>
            </li>
          ))}
      </ul>
      {partie === 'garant' && dossier && d.acte.etape === 'a_valider' ? (
        <div className="panneau-espace mt-8">
          <p>{t.garant}</p>
          <ValidationActe id={id} dossier={dossier} empreinte={d.demande.empreinte_acte} />
        </div>
      ) : null}
      {partie === 'agence' && d.acte.etape === 'preparation' ? <RepriseActe id={id} /> : null}
      <div className="border-ink/15 text-muted mt-8 border-t pt-5 text-sm leading-relaxed">
        <p>
          {t.echeance} {new Date(d.acte.conserver_jusqu_au).toLocaleDateString(locale(langue))}
        </p>
        <p className="mt-2">{t.conserve}</p>
      </div>
    </div>
  )
}
