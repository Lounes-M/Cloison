'use client'

import { useActionState, useEffect, useId, useRef } from 'react'
import { envoyerDemandeAgence, type EtatFormulaire } from '@/lib/agences/action'
import { VOLUMES } from '@/lib/agences/schema'
import { cn } from '@/lib/utils'
import { demande as demandeFr } from '@/lib/content/agences'
import * as en from '@/lib/content/en/formulaires'
import { informationCollecte as collecteFr } from '@/lib/content/information-collecte'
import { choisir, lien, type Langue } from '@/lib/i18n'

const ETAT_INITIAL: EtatFormulaire = { statut: 'inactif' }

const champBase =
  'w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-base font-medium ' +
  'placeholder:text-muted placeholder:font-normal'

function Erreur({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-flame-texte mt-1.5 text-[13px] font-semibold">
      {message}
    </p>
  )
}

export function FormulaireAgence({ langue = 'fr' }: { langue?: Langue }) {
  const t = choisir(langue, demandeFr, en.demande)
  const informationCollecte = choisir(langue, collecteFr, en.informationCollecte)
  const [etat, envoyer, enCours] = useActionState(envoyerDemandeAgence, ETAT_INITIAL)
  const idBase = useId()
  const resume = useRef<HTMLDivElement>(null)

  // Horodatage d'affichage : sert a reperer un envoi trop rapide pour etre
  // humain. Ecrit directement dans le champ apres le rendu : pas d'etat React,
  // donc pas de rendu en cascade, et rien dans le HTML du serveur. Sans
  // JavaScript le champ reste vide et le controle de delai est simplement
  // ignore cote serveur.
  const horodatage = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (horodatage.current) horodatage.current.value = String(Date.now())
  }, [])

  // Un lecteur d'ecran doit apprendre le resultat sans avoir a le chercher.
  useEffect(() => {
    if (etat.statut !== 'inactif') resume.current?.focus()
  }, [etat])

  if (etat.statut === 'succes') {
    return (
      <div
        ref={resume}
        tabIndex={-1}
        className="bg-mint outlined shadow-brut scroll-mt-28 rounded-[18px] p-8 text-center"
      >
        <p className="font-display text-2xl">{t.merci}</p>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed font-medium">
          {t.suite}
        </p>
      </div>
    )
  }

  const champs = etat.champs ?? {}
  const valeurs = etat.valeurs ?? {}

  // `key` change a chaque erreur : React remonte les champs non controles, qui
  // reprennent alors les valeurs renvoyees par le serveur. Sans cela, ils
  // garderaient leur `defaultValue` d'origine, c'est-a-dire vide.
  const cleRendu = etat.statut === 'erreur' ? JSON.stringify(valeurs) : 'initial'

  return (
    <form key={cleRendu} action={envoyer} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="langue" value={langue} />
      {etat.statut === 'erreur' && etat.message ? (
        <div
          ref={resume}
          tabIndex={-1}
          role="alert"
          // `scroll-mt` : le focus fait defiler jusqu'a l'alerte, et l'en-tete
          // collant la masquerait sans cette marge.
          className="bg-flame outlined text-ink scroll-mt-28 rounded-xl px-4 py-3 text-[14px] font-bold"
        >
          {etat.message}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor={`${idBase}-nom`} className="mb-2 block text-[14px] font-bold">
            {t.nom}
          </label>
          <input
            id={`${idBase}-nom`}
            name="nomAgence"
            required
            maxLength={120}
            autoComplete="organization"
            placeholder={t.nomExemple}
            defaultValue={valeurs.nomAgence ?? ''}
            aria-invalid={Boolean(champs.nomAgence)}
            aria-describedby={champs.nomAgence ? `${idBase}-nom-erreur` : undefined}
            className={cn(champBase, champs.nomAgence && 'border-flame')}
          />
          <Erreur id={`${idBase}-nom-erreur`} message={champs.nomAgence} />
        </div>

        <div>
          <label htmlFor={`${idBase}-ville`} className="mb-2 block text-[14px] font-bold">
            {t.ville}
          </label>
          <input
            id={`${idBase}-ville`}
            name="ville"
            required
            maxLength={80}
            autoComplete="address-level2"
            placeholder={t.villeExemple}
            defaultValue={valeurs.ville ?? ''}
            aria-invalid={Boolean(champs.ville)}
            aria-describedby={champs.ville ? `${idBase}-ville-erreur` : undefined}
            className={cn(champBase, champs.ville && 'border-flame')}
          />
          <Erreur id={`${idBase}-ville-erreur`} message={champs.ville} />
        </div>
      </div>

      <div>
        <label htmlFor={`${idBase}-email`} className="mb-2 block text-[14px] font-bold">
          {t.email}
        </label>
        <input
          id={`${idBase}-email`}
          name="email"
          type="email"
          required
          maxLength={180}
          autoComplete="email"
          placeholder={t.emailExemple}
          defaultValue={valeurs.email ?? ''}
          aria-invalid={Boolean(champs.email)}
          aria-describedby={champs.email ? `${idBase}-email-erreur` : undefined}
          className={cn(champBase, champs.email && 'border-flame')}
        />
        <Erreur id={`${idBase}-email-erreur`} message={champs.email} />
      </div>

      <fieldset>
        <legend className="mb-2 block text-[14px] font-bold">{t.volume}</legend>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {VOLUMES.map((volume, index) => (
            <label
              key={volume.valeur}
              className="border-ink bg-paper has-checked:bg-sun flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-3 text-center text-[13.5px] font-bold transition-colors"
            >
              <input
                type="radio"
                name="dossiersParAn"
                value={volume.valeur}
                defaultChecked={
                  valeurs.dossiersParAn ? valeurs.dossiersParAn === volume.valeur : index === 1
                }
                className="sr-only"
              />
              {t.volumes[volume.valeur] ?? volume.libelle}
            </label>
          ))}
        </div>
        <Erreur id={`${idBase}-volume-erreur`} message={champs.dossiersParAn} />
      </fieldset>

      <div>
        <label htmlFor={`${idBase}-message`} className="mb-2 block text-[14px] font-bold">
          {t.message} <span className="text-muted font-medium">{t.facultatif}</span>
        </label>
        <textarea
          id={`${idBase}-message`}
          name="message"
          rows={3}
          maxLength={2000}
          placeholder={t.messageExemple}
          defaultValue={valeurs.message ?? ''}
          aria-invalid={Boolean(champs.message)}
          aria-describedby={champs.message ? `${idBase}-message-erreur` : undefined}
          className={cn(champBase, 'resize-y', champs.message && 'border-flame')}
        />
        <Erreur id={`${idBase}-message-erreur`} message={champs.message} />
      </div>

      {/* Piege a robots : invisible et hors du parcours clavier, seul un
          remplissage automatique y touche. `aria-hidden` evite qu'un lecteur
          d'ecran l'annonce. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor={`${idBase}-site`}>{t.siteWeb}</label>
        <input id={`${idBase}-site`} name="siteWeb" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <input ref={horodatage} type="hidden" name="affichéÀ" defaultValue="" />

      <button
        type="submit"
        disabled={enCours}
        className="press bg-cobalt outlined rounded-brut shadow-brut inline-flex cursor-pointer items-center justify-center px-8 py-4 text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {enCours ? t.envoi : t.bouton}
      </button>

      {/*
        Information au moment de la collecte, completee par la page de
        confidentialite : l'agence doit savoir a quoi elle consent quand elle
        laisse son adresse.
      */}
      <p className="text-muted text-[12.5px] leading-relaxed">
        {t.collecte}{' '}
        <a href={lien(langue, '/confidentialite')} className="underline underline-offset-4">
          {informationCollecte.lien}
        </a>
      </p>
    </form>
  )
}
