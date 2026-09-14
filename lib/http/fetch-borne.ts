/** Dix secondes par echange, corps compris, sans aucun rejeu du transport. */
export function fetchBorne(input: RequestInfo | URL, options?: RequestInit, budget?: AbortSignal) {
  const annulation =
    options?.signal !== undefined
      ? options.signal
      : input instanceof Request
        ? input.signal
        : undefined
  return fetch(input, {
    ...options,
    signal: AbortSignal.any([
      AbortSignal.timeout(10000),
      ...(budget ? [budget] : []),
      ...(annulation ? [annulation] : []),
    ]),
  })
}
