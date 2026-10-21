import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { ouvrir } from '../lib/coffre/enveloppe.ts'
import { ouvrirAvecTrousseau } from '../lib/coffre/rotation-format.ts'
import { ouvrirFichierActe } from '../lib/signature/archive-format.ts'

// Restauration complete d'un projet Supabase vers un projet isole : copie des
// objets Storage, puis verification croisee base, Auth, objets et cle maitresse.
// La base et Auth reviennent par la restauration Supabase ou pg_restore ; cet
// outil n'execute aucun SQL d'ecriture et ne journalise ni identifiant ni contenu.
export const SEAUX = ['pieces', 'actes', 'exports-droits']
const MAX_OBJET = 96 * 1024 * 1024
const MAX_OBJETS = 10000
const sha256 = (octets) => createHash('sha256').update(octets).digest('hex')
const REFERENCE = /^[a-z]{20}$/
const CHEMIN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/

function verifierChemin(chemin) {
  if (typeof chemin !== 'string' || chemin.length > 512 || !CHEMIN.test(chemin))
    throw new Error('Chemin Storage refuse')
  return chemin.split('/').map(encodeURIComponent).join('/')
}

/** Client Storage minimal par cle de service ; aucune redirection suivie. */
export function stockageSupabase({ projet, cle, origine }, requete = fetch) {
  if (!REFERENCE.test(projet ?? '')) throw new Error('Projet invalide')
  if (typeof cle !== 'string' || cle.length < 20 || cle.length > 4096 || /\s/.test(cle))
    throw new Error('Cle de service invalide')
  const base = origine ?? `https://${projet}.supabase.co`
  const entetes = { apikey: cle, Authorization: `Bearer ${cle}` }
  const appeler = (chemin, options = {}) =>
    requete(`${base}/storage/v1/${chemin}`, {
      ...options,
      headers: { ...entetes, ...options.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    })
  async function lister(seau, prefixe) {
    const entrees = []
    for (let decalage = 0; ; decalage += 1000) {
      const r = await appeler(`object/list/${seau}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: prefixe,
          limit: 1000,
          offset: decalage,
          sortBy: { column: 'name', order: 'asc' },
        }),
      })
      if (!r.ok) throw new Error(`Liste Storage refusee : HTTP ${r.status}`)
      const page = await r.json()
      if (!Array.isArray(page)) throw new Error('Liste Storage invalide')
      entrees.push(...page)
      if (page.length < 1000) return entrees
    }
  }
  return {
    projet,
    /** Tous les chemins d'un seau, dossiers virtuels parcourus. */
    async chemins(seau) {
      const resultat = []
      const aParcourir = ['']
      while (aParcourir.length) {
        const prefixe = aParcourir.shift()
        for (const entree of await lister(seau, prefixe)) {
          const chemin = prefixe ? `${prefixe}/${entree.name}` : entree.name
          verifierChemin(chemin)
          // Storage rend les dossiers virtuels sans identifiant.
          if (entree.id === null) aParcourir.push(chemin)
          else resultat.push(chemin)
          if (resultat.length + aParcourir.length > MAX_OBJETS)
            throw new Error('Trop d objets pour cet outil')
        }
      }
      return resultat.sort()
    },
    /** Les octets exacts, ou null si l'objet est absent. */
    async lire(seau, chemin) {
      const r = await appeler(`object/authenticated/${seau}/${verifierChemin(chemin)}`, {
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (r.status === 400 || r.status === 404) {
        await r.body?.cancel()
        return null
      }
      if (!r.ok || !r.body) throw new Error(`Lecture Storage refusee : HTTP ${r.status}`)
      const blocs = []
      let taille = 0
      for await (const bloc of r.body) {
        taille += bloc.length
        if (taille > MAX_OBJET) throw new Error('Objet trop volumineux')
        blocs.push(bloc)
      }
      return Buffer.concat(blocs)
    },
    /** Depot sans ecrasement, sauf `remplacer` pour une metadonnee restauree sans octets. */
    async deposer(seau, chemin, octets, { remplacer = false } = {}) {
      const r = await appeler(`object/${seau}/${verifierChemin(chemin)}`, {
        method: remplacer ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upsert': remplacer ? 'true' : 'false',
          'Cache-Control': 'no-store',
        },
        body: octets,
      })
      await r.body?.cancel()
      if (r.ok) return 'depose'
      if ([400, 409].includes(r.status)) return 'existe'
      throw new Error(`Depot Storage refuse : HTTP ${r.status}`)
    },
  }
}

/** Empreinte d'inventaire comparable entre deux projets, sans lister de chemin. */
export async function inventaireStockage(stockage) {
  const bilan = {}
  for (const seau of SEAUX) {
    const lignes = []
    let octets = 0
    for (const chemin of await stockage.chemins(seau)) {
      const contenu = await stockage.lire(seau, chemin)
      if (!contenu) throw new Error('Objet liste mais illisible')
      octets += contenu.length
      lignes.push(`${chemin}\t${contenu.length}\t${sha256(contenu)}`)
    }
    bilan[seau] = { objets: lignes.length, octets, empreinte: sha256(lignes.join('\n')) }
  }
  return bilan
}

/**
 * Copie chaque objet de la source vers la cible, relu et compare par empreinte.
 * Un objet cible different n'est jamais ecrase. Rejouable apres interruption.
 */
export async function copierStockage(source, cible, { production } = {}) {
  if (
    !REFERENCE.test(production ?? '') ||
    cible.projet === production ||
    source.projet === cible.projet
  )
    throw new Error('La cible doit etre un projet de restauration distinct de la production')
  const bilan = {}
  for (const seau of SEAUX) {
    const compte = { objets: 0, octets: 0, copies: 0, deja: 0, completes: 0, divergents: 0 }
    const lignes = []
    for (const chemin of await source.chemins(seau)) {
      const octets = await source.lire(seau, chemin)
      if (!octets) throw new Error('Objet source disparu pendant la copie')
      const empreinte = sha256(octets)
      compte.objets++
      compte.octets += octets.length
      lignes.push(`${chemin}\t${octets.length}\t${empreinte}`)
      if ((await cible.deposer(seau, chemin, octets)) === 'depose') compte.copies++
      else {
        const present = await cible.lire(seau, chemin)
        if (present && sha256(present) === empreinte) {
          compte.deja++
          continue
        }
        if (present) {
          compte.divergents++
          continue
        }
        // La restauration de base ramene storage.objects sans les octets.
        await cible.deposer(seau, chemin, octets, { remplacer: true })
        compte.completes++
      }
      const relu = await cible.lire(seau, chemin)
      if (!relu || sha256(relu) !== empreinte) throw new Error('Objet copie mais relu different')
    }
    compte.empreinte = sha256(lignes.join('\n'))
    bilan[seau] = compte
  }
  return bilan
}

const tampon = (valeur) => (valeur == null ? null : Buffer.from(valeur))
async function lignes(db, sql, params = []) {
  return (await db.query(sql, params)).rows
}
async function existe(db, table) {
  const [{ present }] = await lignes(db, 'select to_regclass($1) is not null as present', [table])
  return present
}

/**
 * Verifie une restauration sans rien modifier. `db` est connecte a la base
 * restauree, `stockage` au projet restaure, `trousseau` a la copie de secours.
 */
export async function verifierRestauration(db, stockage, trousseau, options = {}) {
  const { reference, maximumObjets = MAX_OBJETS } = options
  const bilan = {
    schema: 'non-verifie',
    auth: {},
    cles: { dossiers: 0, actes: 0, illisibles: 0 },
    courriels: { examines: 0, illisibles: 0 },
    brouillons: { examines: 0, illisibles: 0 },
    pieces: { examinees: 0, ouvertes: 0, sans_objet: 0, sans_cle: 0, illisibles: 0 },
    actes: { examines: 0, ouverts: 0, sans_objet: 0, illisibles: 0 },
    remises: { examinees: 0, conformes: 0, sans_objet: 0, divergentes: 0 },
    objets_sans_ligne: {},
    purges_a_rejouer: 0,
    limite: false,
    erreurs: [],
  }
  if (reference) {
    const [{ empreinte }] = await lignes(db, 'select public.empreinte_schema() as empreinte')
    bilan.schema = isDeepStrictEqual(empreinte, reference) ? 'conforme' : 'different'
    if (bilan.schema !== 'conforme') bilan.erreurs.push('schema')
  }

  // Auth : comptes presents et rattachements intacts. Une restauration avec
  // session_replication_role=replica ne controle pas les cles etrangeres.
  const [auth] = await lignes(
    db,
    `select (select count(*) from auth.users)::int as utilisateurs,
      (select count(*) from public.membres_agence m where not exists
        (select 1 from auth.users u where u.id=m.utilisateur_id))::int as membres_sans_compte,
      (select count(*) from public.membres_agence)::int as membres`,
  )
  bilan.auth = auth
  if (await existe(db, 'auth.identities'))
    bilan.auth.identites = (await lignes(db, 'select count(*)::int as n from auth.identities'))[0].n
  if (await existe(db, 'auth.mfa_factors'))
    bilan.auth.facteurs_verifies = (
      await lignes(db, "select count(*)::int as n from auth.mfa_factors where status='verified'")
    )[0].n
  if (auth.membres_sans_compte) bilan.erreurs.push('auth')

  // Cles : chaque DEK scellee doit s'ouvrir avec la copie de secours seule.
  const deks = new Map()
  const ouvrirDek = (scellee) => {
    const dek = ouvrirAvecTrousseau(scellee, trousseau)
    if (dek.length !== 32) throw new Error('Cle de dossier invalide')
    return dek
  }
  try {
    for (const l of await lignes(
      db,
      'select dossier_id,cle_scellee from public.cles_dossier order by dossier_id',
    )) {
      bilan.cles.dossiers++
      try {
        deks.set(l.dossier_id, ouvrirDek(tampon(l.cle_scellee)))
      } catch {
        bilan.cles.illisibles++
      }
    }
    const cleActe = new Map()
    for (const l of await lignes(
      db,
      'select id,cle_scellee from public.actes_signature where cle_scellee is not null order by id',
    )) {
      bilan.cles.actes++
      try {
        cleActe.set(l.id, ouvrirDek(tampon(l.cle_scellee)))
      } catch {
        bilan.cles.illisibles++
      }
    }
    if (bilan.cles.illisibles) bilan.erreurs.push('cles')

    for (const l of await lignes(
      db,
      'select contenu from public.courriels_sortants where contenu is not null order by id',
    )) {
      bilan.courriels.examines++
      try {
        ouvrirAvecTrousseau(Buffer.from(l.contenu, 'base64'), trousseau).fill(0)
      } catch {
        bilan.courriels.illisibles++
      }
    }
    if (bilan.courriels.illisibles) bilan.erreurs.push('courriels')

    for (const l of await lignes(
      db,
      'select dossier_id,chiffre from public.brouillons_engagement where chiffre is not null order by dossier_id',
    )) {
      bilan.brouillons.examines++
      try {
        ouvrir(tampon(l.chiffre), deks.get(l.dossier_id) ?? Buffer.alloc(32)).fill(0)
      } catch {
        bilan.brouillons.illisibles++
      }
    }
    if (bilan.brouillons.illisibles) bilan.erreurs.push('brouillons')

    let budget = maximumObjets
    const consommer = () => {
      if (budget-- > 0) return true
      bilan.limite = true
      return false
    }
    for (const l of await lignes(db, 'select dossier_id,chemin from public.pieces order by id')) {
      if (!consommer()) break
      bilan.pieces.examinees++
      const dek = deks.get(l.dossier_id)
      if (!dek) {
        bilan.pieces.sans_cle++
        continue
      }
      const objet = await stockage.lire('pieces', l.chemin)
      if (!objet) {
        bilan.pieces.sans_objet++
        continue
      }
      try {
        ouvrir(objet, dek).fill(0)
        bilan.pieces.ouvertes++
      } catch {
        bilan.pieces.illisibles++
      }
    }
    const p = bilan.pieces
    if (p.sans_objet || p.sans_cle || p.illisibles) bilan.erreurs.push('pieces')

    for (const l of await lignes(
      db,
      `select f.id,f.acte_id,f.nature,f.empreinte,f.taille,encode(f.nonce,'hex') as nonce,f.confirme
       from public.fichiers_signature f join public.actes_signature a on a.id=f.acte_id
       where f.confirme and a.cle_scellee is not null order by f.id`,
    )) {
      if (!consommer()) break
      bilan.actes.examines++
      const objet = await stockage.lire('actes', `${l.acte_id}/${l.id}`)
      if (!objet) {
        bilan.actes.sans_objet++
        continue
      }
      try {
        const reference = { ...l, nonce: `\\x${l.nonce}` }
        ouvrirFichierActe(objet, cleActe.get(l.acte_id) ?? Buffer.alloc(32), reference).fill(0)
        bilan.actes.ouverts++
      } catch {
        bilan.actes.illisibles++
      }
    }
    if (bilan.actes.sans_objet || bilan.actes.illisibles) bilan.erreurs.push('actes')
    for (const cle of cleActe.values()) cle.fill(0)
  } finally {
    for (const dek of deks.values()) dek.fill(0)
  }

  // Les remises sont chiffrees pour leur destinataire : empreinte seule.
  for (const l of await lignes(
    db,
    `select id,archive_sha256 from public.remises_droits where disponible and revoque_le is null
     and purge_le is null and expire_le>clock_timestamp() order by id`,
  )) {
    bilan.remises.examinees++
    const objet = await stockage.lire('exports-droits', l.id)
    if (!objet) bilan.remises.sans_objet++
    else if (sha256(objet) === l.archive_sha256) bilan.remises.conformes++
    else bilan.remises.divergentes++
  }
  if (bilan.remises.sans_objet || bilan.remises.divergentes) bilan.erreurs.push('remises')

  // Ce qui existe dans Storage sans ligne : depots posterieurs a la sauvegarde,
  // ou purges a rejouer avant toute ouverture des acces.
  const connus = {
    pieces: new Set(
      (
        await lignes(
          db,
          `select chemin from public.pieces union select chemin from public.objets_a_supprimer`,
        )
      ).map((l) => l.chemin),
    ),
    actes: new Set(
      (
        await lignes(
          db,
          `select acte_id||'/'||id as chemin from public.fichiers_signature
           union select chemin from public.archives_signature_a_supprimer`,
        )
      ).map((l) => l.chemin),
    ),
    'exports-droits': new Set(
      (await lignes(db, 'select id::text as chemin from public.remises_droits')).map(
        (l) => l.chemin,
      ),
    ),
  }
  const enFile = new Set(
    (
      await lignes(
        db,
        `select 'pieces/'||chemin as c from public.objets_a_supprimer
         union select 'actes/'||chemin from public.archives_signature_a_supprimer`,
      )
    ).map((l) => l.c),
  )
  for (const seau of SEAUX) {
    let orphelins = 0
    for (const chemin of await stockage.chemins(seau)) {
      if (!connus[seau].has(chemin)) orphelins++
      if (enFile.has(`${seau}/${chemin}`)) bilan.purges_a_rejouer++
    }
    bilan.objets_sans_ligne[seau] = orphelins
  }
  if (bilan.limite) bilan.erreurs.push('limite')
  return bilan
}

// --- Lanceur : configuration privee par stdin, mode explicite par argument. ---

function decoderCle(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(v)) throw new Error('Cle invalide')
  const b = Buffer.from(v, 'base64')
  if (b.length !== 32 || b.toString('base64') !== v) throw new Error('Cle invalide')
  return b
}

async function lireConfiguration() {
  if (process.stdin.isTTY) throw new Error('Entree privee obligatoire')
  const morceaux = []
  let taille = 0
  for await (const morceau of process.stdin) {
    taille += morceau.length
    if (taille > 16384) throw new Error('Configuration trop volumineuse')
    morceaux.push(morceau)
  }
  return JSON.parse(Buffer.concat(morceaux).toString('utf8'))
}

async function principal() {
  const args = process.argv.slice(2)
  const modes = ['--inventaire', '--copier-storage', '--verifier']
  if (args.length !== 1 || !modes.includes(args[0])) throw new Error('Mode explicite obligatoire')
  const config = await lireConfiguration()
  if (!REFERENCE.test(config.production ?? '')) throw new Error('Reference de production requise')
  if (args[0] === '--inventaire') {
    // Lecture seule : utilisable sur la production comme sur la copie.
    return inventaireStockage(stockageSupabase(config.projet))
  }
  if (args[0] === '--copier-storage') {
    return copierStockage(stockageSupabase(config.source), stockageSupabase(config.cible), {
      production: config.production,
    })
  }
  if (config.cible?.projet === config.production)
    throw new Error('La verification se fait sur la copie restauree, jamais sur la production')
  const adresse = new URL(config.connexion)
  if (!['postgres:', 'postgresql:'].includes(adresse.protocol) || adresse.hash)
    throw new Error('Connexion invalide')
  if (
    !adresse.hostname.endsWith(`${config.cible.projet}.supabase.co`) &&
    !adresse.username.endsWith(`.${config.cible.projet}`)
  )
    throw new Error('La connexion ne correspond pas au projet restaure')
  const trousseau = {
    historique: decoderCle(config.trousseau?.historique),
    active: config.trousseau?.active ? decoderCle(config.trousseau.active) : null,
    lecture: (config.trousseau?.lecture ?? []).map(decoderCle),
  }
  if (trousseau.lecture.length > 4) throw new Error('Trousseau invalide')
  const { Client } = await import('pg')
  const db = new Client({
    connectionString: config.connexion,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
    // Certificat racine Supabase (tableau de bord, Database > SSL) si absent du systeme.
    ssl: { rejectUnauthorized: true, ...(config.ca ? { ca: String(config.ca) } : {}) },
  })
  await db.connect()
  try {
    // Transaction en lecture seule : aucune ecriture possible meme par erreur.
    await db.query('begin read only')
    const reference = JSON.parse(
      await readFile(
        new URL('../lib/exploitation/schema-production.json', import.meta.url),
        'utf8',
      ),
    )
    return await verifierRestauration(db, stockageSupabase(config.cible), trousseau, { reference })
  } finally {
    await db.query('rollback').catch(() => {})
    await db.end().catch(() => {})
    for (const cle of [trousseau.historique, trousseau.active, ...trousseau.lecture]) cle?.fill(0)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const bilan = await principal()
    console.log(JSON.stringify(bilan, null, 2))
    const divergents = Object.values(bilan).some((s) => s?.divergents)
    if (bilan.erreurs?.length || divergents) process.exitCode = 1
  } catch (erreur) {
    // Seuls les messages de cet outil sont affiches : ils ne portent ni secret
    // ni identifiant. Ceux du pilote ou du reseau restent generiques.
    const propre = erreur instanceof Error && erreur.constructor === Error && !erreur.code
    console.error(
      `Restauration refusee : ${propre ? erreur.message : 'connexion ou reponse inattendue'}`,
    )
    process.exitCode = 1
  }
}
