import { defineConfig } from 'vitest/config'

export default defineConfig({
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
