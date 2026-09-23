import { EnteteEspace } from '@/components/ui/EnteteEspace'
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
      <EnteteEspace titre={t.titre} etiquette={t.etiquette} />
      <p className="mt-4">
        {t.modele} : {d.acte.modele}
      </p>
      <p>
        {t.etat} :{' '}
        {d.acte.operation
          ? acces.operationEnCours
            ? t.traitement
            : t.etapes.incertain
          : t.etapes[d.acte.etape]}{' '}
        · {t.fournisseur[d.demande.etat] ?? t.indisponible}
      </p>
      {d.demande.environnement === 'sandbox' ? <p className="mt-4 font-bold">{t.sandbox}</p> : null}
      <p className="mt-4">
        {t.telephoneGarant} : {contexte.telephone}
      </p>
      <ul className="mt-6 grid gap-3">
        {d.fichiers
          .filter((f) => f.confirme && (f.nature === 'projet' || d.acte.etape === 'archive'))
          .map((f) => (
            <li key={f.id}>
              <a
                className="lien-espace"
                href={`/${partie === 'agence' ? 'espace' : 'garant'}/actes/${id}/${f.nature}`}
              >
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
      <p className="mt-6">
        {t.echeance} {new Date(d.acte.conserver_jusqu_au).toLocaleDateString('fr-FR')}
      </p>
      <p className="text-muted mt-8">{t.conserve}</p>
      <Link
        className="lien-espace mt-6 inline-block"
        href={partie === 'agence' ? '/espace' : '/garant'}
      >
        {partie === 'agence' ? t.retour : t.retourGarant}
      </Link>
    </div>
  )
}
