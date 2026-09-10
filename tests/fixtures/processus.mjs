let mode = ''
for await (const bloc of process.stdin) mode += bloc
if (mode === 'bloque') {
  for (;;) {
    /* Simulation d'un decodeur qui ne rend jamais la main. */
  }
} else if (/^memoire:(128|280)$/.test(mode)) {
  // Les pages sont touchees : ce sont des allocations natives residentes,
  // pas une reservation virtuelle ni un gros objet du tas JavaScript.
  globalThis.memoireFixture = Buffer.alloc(Number(mode.split(':')[1]) * 1024 * 1024, 7)
  const fin = Date.now() + 2500
  while (Date.now() < fin) {
    /* Le parent doit surveiller meme si la boucle du decodeur est bloquee. */
  }
  process.stdout.write('ok')
} else if (mode === 'sortie') {
  process.stdout.write(Buffer.alloc(64 * 1024))
} else {
  process.stdout.write(JSON.stringify({ secret: Boolean(process.env.CLE_MAITRESSE), mode }))
}
