/** Le flux prend possession du tampon ; seuls les blocs deja lus restent au destinataire. */
export function fluxArchive(pdf: Buffer, signal: AbortSignal) {
  let offset = 0
  let termine = false
  let controleur: ReadableStreamDefaultController<Uint8Array>
  function effacer() {
    termine = true
    pdf.fill(0)
    signal.removeEventListener('abort', interrompre)
  }
  function interrompre() {
    if (termine) return
    effacer()
    controleur.error(new Error('Lecture interrompue'))
  }
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        controleur = controller
        signal.addEventListener('abort', interrompre, { once: true })
        if (signal.aborted) interrompre()
      },
      pull(controller) {
        if (signal.aborted) return interrompre()
        try {
          if (offset < pdf.length) {
            const fin = Math.min(offset + 65536, pdf.length)
            // Une copie permet d'effacer la source sans alterer le bloc transmis.
            controller.enqueue(new Uint8Array(pdf.subarray(offset, fin)))
            offset = fin
          }
          if (offset === pdf.length) {
            effacer()
            controller.close()
          }
        } catch {
          interrompre()
        }
      },
      cancel() {
        if (!termine) effacer()
      },
    },
    // Aucun bloc en clair n'est precharge lorsque le destinataire ne lit plus.
    { highWaterMark: 0 },
  )
}
