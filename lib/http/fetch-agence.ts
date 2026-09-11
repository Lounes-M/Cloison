/** Borne chaque echange HTTP du SDK agence, sans rejouer une ecriture. */
export function fetchAgence(input: RequestInfo | URL, options?: RequestInit) {
  const annulation =
    options?.signal !== undefined
      ? options.signal
      : input instanceof Request
        ? input.signal
        : undefined
  return fetch(input, {
    ...options,
    signal: AbortSignal.any([AbortSignal.timeout(10000), ...(annulation ? [annulation] : [])]),
  })
}
