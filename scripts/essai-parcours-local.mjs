import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { SignJWT } from 'jose'
import Stripe from 'stripe'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Aucun service externe ni identifiant reel : ce harnais traverse le build
// Next puis un vrai PostgREST adosse aux migrations de la base locale jetable.
export const SECRET_PARCOURS_LOCAL = 'local-isolated-postgrest-tests-32-characters-only'

export async function verifierParcoursLocaux(db, adresseRest, secret) {
  const rest = new URL(adresseRest)
  assert(['127.0.0.1', 'localhost'].includes(rest.hostname), 'PostgREST local obligatoire')
  assert.equal(secret, SECRET_PARCOURS_LOCAL, 'Secret fictif du harnais obligatoire')
  // Docker publie un port local mais Postgres voit l'adresse de son conteneur.
  // Verifier le pair TCP du client, pas inet_server_addr() cote serveur.
  assert(
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress),
    'Connexion PostgreSQL locale obligatoire',
  )
  assert.equal(
    (await db.query('select current_database() as nom')).rows[0].nom,
    'cloison_audit_test',
    'Base jetable nommee obligatoire',
  )
  assert.equal(
    Number((await db.query('select count(*) from dossiers')).rows[0].count),
    0,
    'Base jetable vide obligatoire',
  )

  // Le SDK signe localement les fixtures ; aucune methode reseau n'est appelee.
  const secretWebhook = 'whsec_parcours_strictement_local_non_secret'
  const stripe = new Stripe('sk_test_parcours_strictement_local_non_secret')
  const preuves = []
  const noter = (preuve) => {
    preuves.push(preuve)
    console.log(`OK : ${preuve}`)
  }
  const appels = []
  const proxy = createServer(async (requete, reponse) => {
    try {
      if (!requete.url.startsWith('/rest/v1/')) {
        reponse.writeHead(404).end()
        return
      }
      const destination = new URL(requete.url.replace(/^\/rest\/v1/, ''), rest)
      const headers = new Headers()
      for (const [nom, valeur] of Object.entries(requete.headers)) {
        if (nom !== 'host' && valeur !== undefined) headers.set(nom, String(valeur))
      }
      const morceaux = []
      for await (const morceau of requete) morceaux.push(morceau)
      const resultat = await fetch(destination, {
        method: requete.method,
        headers,
        body: morceaux.length ? Buffer.concat(morceaux) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      })
      appels.push({ chemin: destination.pathname, statut: resultat.status })
      reponse.writeHead(resultat.status, Object.fromEntries(resultat.headers))
      reponse.end(Buffer.from(await resultat.arrayBuffer()))
    } catch {
      reponse.writeHead(502).end()
    }
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  const api = `http://127.0.0.1:${proxy.address().port}`
  // Un port attribue par le noyau evite de prendre le serveur d'un autre essai.
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const site = `http://127.0.0.1:${port}`
  let sortie = ''
  const next = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_SITE_URL: site,
        SUPABASE_URL: api,
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_locale',
        SUPABASE_JWT_SECRET: secret,
        CLE_MAITRESSE: Buffer.alloc(32, 1).toString('base64'),
        STRIPE_SECRET_KEY: 'sk_test_parcours_strictement_local_non_secret',
        STRIPE_WEBHOOK_SECRET: secretWebhook,
        CRON_SECRET: 'supervision-strictement-locale',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  next.stdout.on('data', (b) => {
    sortie = (sortie + b).slice(-8_000)
  })
  next.stderr.on('data', (b) => {
    sortie = (sortie + b).slice(-8_000)
  })
  const requeter = (chemin, cookie) =>
    fetch(new URL(chemin, site), {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  try {
    let pret = false
    for (let i = 0; i < 80; i++) {
      try {
        if ((await requeter('/')).ok) {
          pret = true
          break
        }
      } catch {
        /* Demarrage. */
      }
      if (next.exitCode !== null) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert(pret, `Build Next local indisponible : ${sortie}`)
    const {
      rows: [dossier],
    } = await db.query(
      "insert into dossiers(email_locataire,email_garant,reference,loyer_cents) values ('locataire@parcours.invalid','garant@parcours.invalid','PARCOURS1234',85000) returning id",
    )
    const {
      rows: [autre],
    } = await db.query(
      "insert into dossiers(email_locataire,reference) values ('autre@parcours.invalid','AUTRE1234567') returning id",
    )
    await db.query(
      "insert into engagements(dossier_id,montant_max_cents,revenu_net_mensuel_cents,nom,prenom) values ($1,123456700,98765400,'CONFIDENTIELPARCOURS','Garant')",
      [dossier.id],
    )
    await db.query(
      "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values ($1,'bulletin_paie',$2,1024,'application/pdf')",
      [dossier.id, `${dossier.id}/piece-fictive`],
    )
    const tokens = {}
    for (const partie of ['locataire', 'garant']) {
      const {
        rows: [lien],
      } = await db.query(
        "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values ($1,$2,gen_random_uuid(),now()+interval '1 hour') returning jti",
        [dossier.id, partie],
      )
      tokens[partie] = await new SignJWT({
        role: 'porteur_lien',
        dossier_id: dossier.id,
        role_partie: partie,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setJti(lien.jti)
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(secret))
    }
    const cookies = {}
    for (const partie of ['locataire', 'garant']) {
      const connexion = await requeter(`/lien/${tokens[partie]}`)
      assert.equal(connexion.status, 307)
      assert.equal(new URL(connexion.headers.get('location'), site).pathname, `/${partie}`)
      const cookie = connexion.headers.get('set-cookie')
      assert.match(cookie, /HttpOnly/i)
      assert.match(cookie, /SameSite=lax/i)
      cookies[partie] = cookie.split(';')[0]
      const page = await requeter(`/${partie}`, cookies[partie])
      const html = await page.text()
      assert.equal(page.status, 200, `${partie} : ${sortie}`)
      assert(html.includes('PARCOURS1234'), 'Dossier attendu rendu par Next')
      assert(!html.includes('AUTRE1234567'), 'Autre dossier absent du rendu')
      assert(!html.includes(tokens[partie]), 'JWT absent du HTML')
      if (partie === 'locataire') {
        assert(!html.includes('CONFIDENTIELPARCOURS'), 'Identite du garant absente du HTML')
        assert(!html.includes((987654).toLocaleString('fr-FR')), 'Revenu du garant absent du HTML')
      } else {
        assert(
          html.includes((987654).toLocaleString('fr-FR')),
          'Revenu confidentiel vraiment present pour le garant',
        )
      }
      noter(`${partie} : lien verifie par SQL, cookie HttpOnly et rendu Next du seul dossier`)
    }
    if (process.env.CLOISON_TEST_NAVIGATEUR === '1') {
      const { verifierNavigateurPorteurs } = await import('./verifier-navigateur-porteurs.mjs')
      await verifierNavigateurPorteurs({
        site,
        cookies,
        db,
        dossierId: dossier.id,
        autreId: autre.id,
      })
      noter('Interactions navigateur locales confirmees dans PostgreSQL')
    }
    const croise = await requeter('/garant', cookies.locataire)
    assert.equal(croise.status, 307)
    assert.equal(new URL(croise.headers.get('location'), site).pathname, '/locataire')
    noter('locataire redirige hors de l espace garant')
    for (const table of ['pieces', 'engagements']) {
      const r = await fetch(`${adresseRest}/${table}?dossier_id=eq.${dossier.id}&select=*`, {
        headers: { Authorization: `Bearer ${tokens.locataire}` },
      })
      assert.equal(r.status, 200)
      assert.deepEqual(await r.json(), [])
    }
    const tiers = await fetch(`${adresseRest}/dossiers?id=eq.${autre.id}&select=id`, {
      headers: { Authorization: `Bearer ${tokens.locataire}` },
    })
    assert.deepEqual(await tiers.json(), [])
    noter('PostgREST refuse au locataire les pieces, engagements et dossiers tiers')
    await db.query(
      "update jetons_actifs set jti=gen_random_uuid() where dossier_id=$1 and partie='locataire'",
      [dossier.id],
    )
    for (const chemin of ['/locataire', `/lien/${tokens.locataire}`]) {
      const refuse = await requeter(chemin, cookies.locataire)
      assert.equal(refuse.status, 307)
      assert.equal(new URL(refuse.headers.get('location'), site).pathname, '/lien-invalide')
    }
    noter('revocation SQL refuse le cookie deja etabli et le lien initial')
    const faux = await requeter(`/lien/${tokens.garant.slice(0, -10)}INVALIDE00`)
    assert.equal(new URL(faux.headers.get('location'), site).pathname, '/lien-invalide')
    noter('signature falsifiee refusee par Next')
    for (const autorisation of ['', 'Bearer secret-falsifie']) {
      const refuse = await fetch(`${site}/api/supervision`, {
        headers: { Authorization: autorisation },
        redirect: 'error',
      })
      assert.equal(refuse.status, 401)
      await refuse.arrayBuffer()
    }
    assert(!appels.some((a) => a.chemin === '/rpc/rapport_exploitation'))
    const supervision = await fetch(`${site}/api/supervision`, {
      headers: { Authorization: 'Bearer supervision-strictement-locale' },
      redirect: 'error',
    })
    assert.equal(supervision.status, 200)
    assert.equal(supervision.headers.get('cache-control'), 'no-store')
    const attendu = (await db.query('select public.rapport_exploitation() as rapport')).rows[0]
      .rapport
    assert.deepEqual(await supervision.json(), attendu)
    noter(
      'supervision HTTP : refus anonymes, rapport agrege exact sans cache via Next et PostgREST',
    )
    for (const authorization of [undefined, 'Bearer invalide']) {
      const r = await fetch(`${site}/api/schema`, {
        headers: authorization ? { Authorization: authorization } : {},
        redirect: 'error',
      })
      assert.equal(r.status, 401)
    }
    assert(!appels.some((a) => a.chemin === '/rpc/empreinte_schema'))
    const schema = await fetch(`${site}/api/schema`, {
      headers: { Authorization: 'Bearer supervision-strictement-locale' },
      redirect: 'error',
    })
    // La base du harnais n'est pas la reference Supabase : ne pas l'accepter par repli.
    assert.equal(schema.status, 503)
    assert.equal(schema.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await schema.json(), { conforme: false })
    assert(appels.some((a) => a.chemin === '/rpc/empreinte_schema'))
    noter('schema HTTP : refus anonymes et schema du harnais refuse sans detail via Next/PostgREST')
    const {
      rows: [aPayer],
    } = await db.query(
      "insert into dossiers(email_locataire,reference) values ('paiement@parcours.invalid','STRIPELOCAL1234') returning id",
    )
    const etatPaiement = async () =>
      (
        await db.query('select paye_le,paiement_ref,expire_le from dossiers where id=$1', [
          aPayer.id,
        ])
      ).rows[0]
    const avantPaiement = await etatPaiement()
    assert.equal(avantPaiement.paye_le, null)
    assert.equal(avantPaiement.paiement_ref, null)
    const dateEvenement = Math.floor(Date.now() / 1000)
    const evenement = (surcharge = {}) => ({
      id:
        'evt_parcours_fictif' +
        (Object.keys(surcharge).length ? '_' + Object.keys(surcharge).join('_') : ''),
      created: dateEvenement,
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id:
            'cs_test_parcours_fictif' +
            (Object.keys(surcharge).length ? '_' + Object.keys(surcharge).join('_') : ''),
          object: 'checkout.session',
          payment_status: 'paid',
          mode: 'payment',
          currency: 'eur',
          amount_total: 900,
          client_reference_id: aPayer.id,
          metadata: { dossier_id: aPayer.id },
          ...surcharge,
        },
      },
    })
    async function webhook(surcharge = {}, signature = 'valide') {
      const corps = JSON.stringify(evenement(surcharge))
      const headers = { 'Content-Type': 'application/json' }
      if (signature !== 'absente') {
        headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({
          payload: corps,
          secret: signature === 'valide' ? secretWebhook : 'whsec_autre_fixture_locale',
        })
      }
      return fetch(`${site}/api/paiement/webhook`, {
        method: 'POST',
        headers,
        body: corps,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
    }
    for (const [nom, surcharge, signature, statut] of [
      ['signature absente', {}, 'absente', 400],
      ['signature falsifiee', {}, 'falsifiee', 400],
      ['montant incorrect', { amount_total: 899 }, 'valide', 200],
      ['devise incorrecte', { currency: 'usd' }, 'valide', 200],
      ['mode incorrect', { mode: 'subscription' }, 'valide', 200],
      ['paiement non regle', { payment_status: 'unpaid' }, 'valide', 200],
    ]) {
      const refus = await webhook(surcharge, signature)
      assert.equal(refus.status, statut, `Webhook ${nom} : ${sortie}`)
      await refus.arrayBuffer()
      assert.deepEqual(await etatPaiement(), avantPaiement, `Webhook ${nom} sans mutation`)
      noter(`webhook Stripe local : ${nom} ne marque aucun paiement`)
    }
    assert(!appels.some((a) => a.chemin === '/rpc/marquer_dossier_paye'))
    const confirme = await webhook()
    assert.equal(confirme.status, 200, `Webhook valide : ${sortie}`)
    assert.deepEqual(await confirme.json(), { recu: true, marque: true })
    const apresPaiement = await etatPaiement()
    assert(apresPaiement.paye_le instanceof Date, 'Paiement inscrit dans PostgreSQL')
    assert.equal(apresPaiement.paiement_ref, 'cs_test_parcours_fictif')
    noter('webhook Stripe local signe de 900 centimes EUR : vrai marquage via Next et PostgREST')
    const rejoue = await webhook()
    assert.equal(rejoue.status, 200)
    assert.deepEqual(await rejoue.json(), { recu: true, marque: true })
    assert.deepEqual(
      await etatPaiement(),
      apresPaiement,
      'Rejeu sans nouveau marquage ni prolongation',
    )
    assert.equal(
      appels.filter((a) => a.chemin === '/rpc/enregistrer_paiement_locataire' && a.statut === 200)
        .length,
      4,
    )
    noter('rejeu du webhook : reference, date de paiement et echeance SQL strictement inchangees')
    assert(appels.some((a) => a.chemin === '/rpc/jeton_est_actif' && a.statut === 200))
    assert(appels.some((a) => a.chemin === '/dossiers' && a.statut === 200))
    return {
      nature:
        process.env.CLOISON_TEST_NAVIGATEUR === '1'
          ? 'Chromium, Firefox, WebKit, Next et PostgREST locaux ; sans Checkout distant, Supabase Auth ou Storage reels'
          : 'HTTP Next et PostgREST reels, webhook Stripe signe localement ; sans Checkout distant, navigateur, Supabase Auth ou Storage',
      preuves,
    }
  } finally {
    next.kill('SIGTERM')
    if (next.exitCode === null) await once(next, 'exit')
    proxy.closeAllConnections()
    await new Promise((resolve) => proxy.close(resolve))
  }
}

// Entree CI : seules la base jetable et l'API boucle locale sont acceptees.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const connexion = process.env.PGTEST_URL
  const cible = new URL(connexion ?? 'http://invalide')
  assert(
    ['127.0.0.1', 'localhost'].includes(cible.hostname) && cible.pathname === '/cloison_audit_test',
    'Base locale jetable cloison_audit_test obligatoire',
  )
  const { Client } = await import('pg')
  const db = new Client({ connectionString: connexion })
  await db.connect()
  try {
    await verifierParcoursLocaux(
      db,
      process.env.POSTGREST_TEST_URL,
      process.env.POSTGREST_TEST_SECRET,
    )
  } finally {
    await db.end()
  }
}
