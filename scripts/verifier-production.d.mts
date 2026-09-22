export function verifierProduction(
  transport?: typeof fetch,
  signalAppelant?: AbortSignal,
): Promise<{ conforme: boolean; controles: { id: string; conforme: boolean }[] }>
