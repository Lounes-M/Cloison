import assert from 'node:assert/strict'

export function surveillerAudience(page) {
  let audience = false
  const observer = (requete) => {
    const url = new URL(requete.url())
    if (
      /^\/_vercel\/(?:insights|speed-insights)(?:\/|$)/.test(url.pathname) ||
      /(?:^|\.)(?:vercel-insights\.com|vercel-scripts\.com|vitals\.vercel\.insights)$/.test(
        url.hostname,
      )
    )
      audience = true
  }
  page.on('request', observer)
  return {
    verifier() {
      assert.equal(audience, false, 'Une requete de mesure audience traverse le parcours')
    },
    terminer() {
      page.off('request', observer)
    },
  }
}

export async function verifierDetectionAudience(contexte, site) {
  const page = await contexte.newPage()
  const garde = surveillerAudience(page)
  try {
    await page.route('**/_vercel/insights/view', (route) => route.fulfill({ status: 204 }))
    await page.goto(site)
    garde.verifier()
    // Mutation controlee, interceptee localement : aucun contenu ne sort du navigateur.
    await page.evaluate(() => fetch('/_vercel/insights/view', { method: 'POST', body: '{}' }))
    assert.throws(() => garde.verifier(), /Une requete de mesure audience traverse le parcours/)
  } finally {
    garde.terminer()
    await page.close()
  }
}
