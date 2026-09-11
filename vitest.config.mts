import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Le meme alias que tsconfig : sans lui, un test qui importe `@/lib/...`
  // echoue a la resolution alors que le typecheck, lui, passe.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),

      // `server-only` leve des qu'il est importe hors composant serveur, ce
      // qui ferait echouer tout fichier de test important un module serveur.
      // La protection reste entiere au build, seul le test la contourne.
      'server-only': fileURLToPath(new URL('./tests/doublures/server-only.ts', import.meta.url)),
    },
  },

  test: {
    include: ['tests/**/*.test.ts'],

    // Chaque test construit sa propre base Postgres en WebAssembly. C'est
    // rapide, mais pas gratuit : un fichier par processus evite que plusieurs
    // instances se disputent la memoire sur une machine modeste.
    fileParallelism: false,

    // Une base qui ne se cree pas en 30 secondes signale un probleme, pas une
    // lenteur.
    testTimeout: 30_000,
  },
})
