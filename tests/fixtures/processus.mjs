let mode = ''
for await (const bloc of process.stdin) mode += bloc
if (mode === 'bloque') {
  for (;;) {
    /* Simulation d'un decodeur qui ne rend jamais la main. */
  }
} else if (mode === 'sortie') {
  process.stdout.write(Buffer.alloc(64 * 1024))
} else {
  process.stdout.write(JSON.stringify({ secret: Boolean(process.env.CLE_MAITRESSE), mode }))
}
