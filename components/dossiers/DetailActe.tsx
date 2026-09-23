import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { Icone } from '@/components/ui/Icone'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { accesActe } from '@/lib/signature/lecture'
import { ouvrirContexteActe } from '@/lib/signature/parcours'
import { ValidationActe, RepriseActe } from '@/components/forms/FormulaireActe'
import { signature as t } from '@/lib/content/signature'
export async function DetailActe({ id, partie }: { id: string; partie: 'agence' | 'garant' }) {
  const acces = await accesActe(id, partie).catch(() => null)
  if (!acces) notFound()
  const { d, dossier } = acces
  const { cle, contexte } = ouvrirContexteActe(d)
  cle.fill(0)
  return (
    <div className="page-espace w-full max-w-[880px]">
      <Link className="lien-espace mb-6" href={partie === 'agence' ? '/espace' : '/garant'}>
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
      <dl className="panneau-espace grid gap-6 sm:grid-cols-2">
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
          {t.echeance} {new Date(d.acte.conserver_jusqu_au).toLocaleDateString('fr-FR')}
        </p>
        <p className="mt-2">{t.conserve}</p>
      </div>
    </div>
  )
}
