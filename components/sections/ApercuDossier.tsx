import { Icone } from '@/components/ui/Icone'
import { LiveDot } from '@/components/ui/LiveDot'
import { apercuDossier } from '@/lib/content/agences'

/**
 * L'apercu du dossier tel que l'agence le recoit.
 *
 * Il montre la promesse au lieu de la decrire, et c'est le seul endroit du site
 * ou l'on voit a quoi ressemble un dossier. Entierement decoratif : tout est
 * fictif, rien n'est cliquable, et l'ensemble est retire de l'arbre
 * d'accessibilite. Un lecteur d'ecran entendrait sinon une liste de pieces et
 * un bouton « Signer » qui n'existent pas, juste apres un titre qui vient de
 * les annoncer.
 */
export function ApercuDossier() {
  return (
    <div aria-hidden className="animate-fade-up relative [animation-delay:0.3s]">
      <div className="border-ink shadow-brut-xs bg-mint animate-float absolute -top-6 -right-2.5 z-10 flex rotate-6 items-center gap-2 rounded-[10px] border-2 px-3.5 py-2 text-[13px] font-bold">
        <LiveDot className="border-ink border-2" />
        {apercuDossier.badge}
      </div>

      <div className="border-ink shadow-brut-lg bg-paper rotate-1 overflow-hidden rounded-[18px] border-[2.5px]">
        {/* Barre de fenetre : elle situe la scene (un lien ouvert dans un
            navigateur) sans avoir a l'ecrire. */}
        <div className="bg-ink flex items-center gap-2 px-4 py-3">
          <span className="bg-flame border-cream size-[11px] rounded-full border-[1.5px]" />
          <span className="bg-sun border-cream size-[11px] rounded-full border-[1.5px]" />
          <span className="bg-mint border-cream size-[11px] rounded-full border-[1.5px]" />
          <span className="ml-2 flex-1 rounded-md bg-[#333] px-3 py-[5px] text-[11px] text-[#bbb]">
            {apercuDossier.url}
          </span>
        </div>

        <div className="flex flex-col gap-3 px-5.5 py-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-[15px]">{apercuDossier.titre}</span>
            <span className="bg-mint border-ink flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[11px] font-bold">
              {apercuDossier.etat}
              <Icone nom="coche" className="size-3" />
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {apercuDossier.pieces.map((piece) => (
              <div
                key={piece}
                className="border-ink relative flex items-center justify-between overflow-hidden rounded-[10px] border-[1.5px] px-3.5 py-2.5 text-[12.5px] font-semibold"
              >
                <span>{piece}</span>
                {/* Le filigrane est pale et de travers, comme sur la piece
                    reelle : c'est ce que l'agence voit, pas un badge d'etat. */}
                <span className="font-display text-ink/15 absolute top-1.5 right-16 -rotate-12 text-[10px] tracking-[0.2em] uppercase">
                  {apercuDossier.filigrane}
                </span>
                <Icone nom="coche" className="text-live size-3.5" />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <div className="bg-sun border-ink min-w-20 flex-1 rounded-xl border-2 px-3.5 py-3">
              <p className="text-[10.5px] font-bold tracking-[0.06em] uppercase">
                {apercuDossier.ratio.libelle}
              </p>
              <p className="font-display text-xl">{apercuDossier.ratio.valeur}</p>
            </div>
            <div className="bg-sky border-ink flex min-w-40 flex-2 flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3.5 py-3">
              <div>
                <p className="text-[10.5px] font-bold tracking-[0.06em] uppercase">
                  {apercuDossier.acte.libelle}
                </p>
                <p className="font-display text-sm">{apercuDossier.acte.valeur}</p>
              </div>
              <span className="bg-paper border-ink font-display rounded-lg border-2 px-3 py-1.5 text-[13px]">
                {apercuDossier.acte.action}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
