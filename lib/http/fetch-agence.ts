import { fetchBorne } from './fetch-borne'

/** Borne chaque echange HTTP du SDK agence, sans rejouer une ecriture. */
export function fetchAgence(input: RequestInfo | URL, options?: RequestInit) {
  return fetchBorne(input, options)
}
