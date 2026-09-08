import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'
import { preparerBase } from './test-postgrest.mjs'
import { sauvegarder, restaurer } from './sauvegarde-locale.mjs'
import { nouvelleCle, sceller, ouvrir } from '../lib/coffre/enveloppe.ts'

const sha256 = (contenu) => createHash('sha256').update(contenu).digest('hex')
const NOM_BASE = 'cloison_restauration_test'
const ROLES_FIXTURE = [
  'anon',
  'authenticated',
  'service_role',
  'authenticator',
  'porteur_lien',
  'serveur',
  'depot_piece',
]
const CATALOGUES = {
  tables: `select n.nspname,c.relname,pg_get_userbyid(c.relowner) as proprietaire,
    c.relrowsecurity,c.relforcerowsecurity,c.relacl::text as droits from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage')
    and c.relkind in ('r','S','v') order by 1,2`,
  contraintes: `select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) as definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage') order by 1,2,3`,
  politiques: `select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname in ('public','auth','storage') order by 1,2,3`,
  fonctions: `select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_userbyid(p.proowner) as proprietaire,p.proacl::text as droits,
    pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','auth','storage') and p.prokind in ('f','p') order by 1,2,3`,
  roles: `select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
    rolreplication,rolbypassrls,rolconnlimit from pg_roles order by rolname`,
  adhesions: `select r.rolname as role,m.rolname as membre,g.rolname as auteur,
    a.admin_option,a.inherit_option,a.set_option from pg_auth_members a
    join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member
    join pg_roles g on g.oid=a.grantor order by 1,2,3`,
}

export function verifierUrlRestauration(adresse) {
  const url = new URL(adresse)
  assert(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.pathname === `/${NOM_BASE}` &&
      !url.search &&
      !url.hash &&
      url.username === 'postgres',
    'Deux bases PostgreSQL locales jetables cloison_restauration_test, bootstrap postgres, sans options URL sont requises',
  )
  return url
}

function creerClient(adresse) {
  return new Client({
    connectionString: adresse,
    ssl: false,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 15000,
  })
}

async function verifierClusterVide(db) {
  assert(
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress),
    'Connexion PostgreSQL non loopback refusee',
  )
  const etat = (
    await db
      .query(
        `select current_database() as base,
    current_setting('server_version_num')::integer/10000 as version,
    (select system_identifier::text from pg_control_system()) as identite,
    inet_server_addr()::text as adresse,
    exists(select 1 from pg_namespace where nspname in ('auth','storage')) as schemas,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') as objets,
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as fonctions,
    exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') as types,
    exists(select 1 from pg_roles where rolname<>'postgres' and rolname !~ '^pg_') as roles,
    exists(select 1 from pg_database where not datistemplate and datname not in ('postgres','${NOM_BASE}')) as autres_bases`,
      )
      .then((r) => r.rows)
  )[0]
  // Docker NAT arrive par une adresse privee du conteneur ; l'URL cliente est loopback.
  assert(
    etat.base === NOM_BASE && etat.version === 17 && etat.adresse,
    'Serveur PostgreSQL 17 local de test obligatoire',
  )
  assert(
    !etat.schemas &&
      !etat.objets &&
      !etat.fonctions &&
      !etat.types &&
      !etat.roles &&
      !etat.autres_bases,
    'Cluster non vierge : exercice refuse avant toute mutation',
  )
  return etat.identite
}

function outils(url, conteneur, repertoireClients) {
  if (conteneur)
    assert(/^[a-f0-9]{12,64}$/.test(conteneur), 'Identifiant de conteneur local invalide')
  else
    assert(
      repertoireClients && resolve(repertoireClients) === repertoireClients,
      'Repertoire absolu des clients PostgreSQL 17 requis',
    )
  return (nom, argumentsOutil = [], entree) => {
    assert(['pg_dump', 'pg_dumpall', 'pg_restore', 'psql'].includes(nom))
    const connexion = [
      '--host',
      conteneur ? '127.0.0.1' : url.hostname,
      '--port',
      conteneur ? '5432' : url.port || '5432',
      '--username',
      'postgres',
    ]
    const argumentsComplets = argumentsOutil.includes('--version')
      ? argumentsOutil
      : [...connexion, ...argumentsOutil]
    const executable = conteneur ? 'docker' : join(repertoireClients, nom)
    const argumentsProcessus = conteneur
      ? ['exec', '--env', 'PGPASSWORD', '-i', conteneur, nom, ...argumentsComplets]
      : argumentsComplets
    const resultat = spawnSync(executable, argumentsProcessus, {
      input: entree,
      timeout: 60000,
      maxBuffer: 128 * 1024 * 1024,
      env: {
        PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
        LANG: 'C',
        PGPASSWORD: decodeURIComponent(url.password),
      },
    })
    // Ni dump, ni stderr potentiellement sensible dans les journaux.
    assert.equal(resultat.status, 0, `Outil ${nom} en echec (sortie masquee)`)
    return resultat.stdout
  }
}

async function photographier(db) {
  const resultat = {}
  for (const [nom, requete] of Object.entries(CATALOGUES))
    resultat[nom] = (await db.query(requete)).rows
  return resultat
}
function comparer(attendu, actuel) {
  for (const nom of Object.keys(CATALOGUES)) {
    // Le diagnostic indique seulement la categorie, pas les definitions ni donnees.
    assert(
      JSON.stringify(attendu[nom]) === JSON.stringify(actuel[nom]),
      `Restauration differente : ${nom}`,
    )
  }
}
async function nettoyerSchemas(db) {
  await db.query('reset role')
  await db.query(
    'drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; create schema public authorization postgres',
  )
}
async function nettoyerRoles(db) {
  const roles = (
    await db.query('select rolname from pg_roles where rolname=any($1::text[]) order by rolname', [
      ROLES_FIXTURE,
    ])
  ).rows
  for (const { rolname } of roles) await db.query(`drop owned by "${rolname}" cascade`)
  for (const { rolname } of roles) await db.query(`drop role "${rolname}"`)
}

export function verifierCorrespondanceCluster(executer, identite) {
  const cible = executer('psql', [
    '--dbname',
    NOM_BASE,
    '-X',
    '-A',
    '-t',
    '--command',
    "select current_database() || ':' || system_identifier::text from pg_control_system()",
  ])
    .toString()
    .trim()
  assert.equal(
    cible,
    `${NOM_BASE}:${identite}`,
    'Identite du conteneur differente du cluster controle',
  )
}

/** Exercice autonome sur deux clusters vierges, jamais une restauration de production. */
export async function verifierRestaurationPostgres(configuration) {
  const sourceUrl = verifierUrlRestauration(configuration.source)
  const cibleUrl = verifierUrlRestauration(configuration.cible)
  assert(sourceUrl.host !== cibleUrl.host, 'Deux serveurs distincts sont requis')
  const source = creerClient(configuration.source),
    cible = creerClient(configuration.cible)
  let sourceConnectee = false,
    cibleConnectee = false,
    autorise = false,
    repertoire
  const debut = Date.now()
  try {
    await source.connect()
    sourceConnectee = true
    await cible.connect()
    cibleConnectee = true
    const identiteSource = await verifierClusterVide(source),
      identiteCible = await verifierClusterVide(cible)
    assert.notEqual(identiteSource, identiteCible, 'Deux ports du meme cluster sont refuses')
    const exporter = outils(sourceUrl, configuration.conteneurSource, configuration.clients)
    const importer = outils(cibleUrl, configuration.conteneurCible, configuration.clients)
    for (const [executer, nom] of [
      [exporter, 'pg_dump'],
      [exporter, 'pg_dumpall'],
      [importer, 'pg_restore'],
    ]) {
      assert.match(
        executer(nom, ['--version']).toString(),
        /\(PostgreSQL\) 17\./,
        'Client PostgreSQL 17 requis',
      )
    }
    if (configuration.conteneurSource) {
      verifierCorrespondanceCluster(exporter, identiteSource)
      // Le controle doit detecter un mauvais mapping, pas seulement accepter le bon.
      assert.throws(
        () => verifierCorrespondanceCluster(exporter, identiteCible),
        /Identite du conteneur/,
      )
    }
    if (configuration.conteneurCible) verifierCorrespondanceCluster(importer, identiteCible)
    autorise = true
    repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-restauration-'))
    await preparerBase(source)
    const id = randomUUID(),
      utilisateur = randomUUID(),
      garant = randomUUID(),
      locataire = randomUUID(),
      chemin = `${id}/${randomUUID()}`
    const kek = nouvelleCle(),
      dek = nouvelleCle(),
      cleSauvegarde = nouvelleCle()
    const original = Buffer.from('Exercice de restauration CLOISON exclusivement fictif.')
    const chiffre = sceller(original, dek)
    await source.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'restauration@example.invalid',now())",
      [utilisateur],
    )
    await source.query(
      "insert into dossiers(id,email_locataire,email_garant) values($1,'locataire@example.invalid','garant@example.invalid')",
      [id],
    )
    await source.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
      id,
      sceller(dek, kek),
    ])
    await source.query(
      "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values($1,'bulletin_paie',$2,$3,'application/pdf')",
      [id, chemin, original.length],
    )
    await source.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
    for (const [partie, jti] of [
      ['garant', garant],
      ['locataire', locataire],
    ]) {
      await source.query(
        "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values($1,$2,$3,now()+interval '1 day')",
        [id, partie, jti],
      )
    }
    const attendu = await photographier(source)
    const dump = exporter('pg_dump', ['--dbname', NOM_BASE, '--format=custom', '--compress=0'])
    const rolesSql = exporter('pg_dumpall', [
      '--database',
      NOM_BASE,
      '--roles-only',
      '--no-role-passwords',
    ]).toString()
    assert(!/PASSWORD\s+'/i.test(rolesSql), 'Export de mots de passe refuse')
    const exportLocal = join(repertoire, 'export')
    await mkdir(join(exportLocal, 'objets', id), { recursive: true })
    await writeFile(join(exportLocal, 'base.dump'), dump)
    await writeFile(join(exportLocal, 'objets', chemin), chiffre)
    await writeFile(
      join(exportLocal, 'configuration.json'),
      JSON.stringify({
        version: 1,
        formatBase: 'postgres-custom',
        creeLe: new Date().toISOString(),
        base: { taille: dump.length, sha256: sha256(dump) },
        objets: [{ chemin: `objets/${chemin}`, taille: chiffre.length, sha256: sha256(chiffre) }],
        rolesSql,
      }),
    )
    const archive = join(repertoire, 'sauvegarde.cloison')
    await sauvegarder(exportLocal, archive, cleSauvegarde)
    await rm(exportLocal, { recursive: true })
    await nettoyerSchemas(source)
    assert.equal(
      (
        await source.query(
          "select count(*)::int as n from information_schema.tables where table_schema in ('public','auth','storage')",
        )
      ).rows[0].n,
      0,
    )
    const extraction = join(repertoire, 'extraction')
    await restaurer(archive, extraction, cleSauvegarde)
    const contrat = JSON.parse(await readFile(join(extraction, 'configuration.json'), 'utf8'))
    // Seule la sortie generee ci-dessus est executee. Aucun dump externe n'est accepte.
    assert.equal(
      contrat.rolesSql.split('\n').filter((l) => l === 'CREATE ROLE postgres;').length,
      1,
    )
    await cible.query(
      contrat.rolesSql
        .split('\n')
        .filter((l) => !l.startsWith('\\') && l !== 'CREATE ROLE postgres;')
        .join('\n'),
    )
    importer(
      'pg_restore',
      ['--dbname', NOM_BASE, '--exit-on-error', '--single-transaction'],
      await readFile(join(extraction, 'base.dump')),
    )
    comparer(attendu, await photographier(cible))
    assert.equal(
      (
        await cible.query(
          'select count(*)::int as n from auth.users where id=$1 and email_confirmed_at is not null',
          [utilisateur],
        )
      ).rows[0].n,
      1,
    )
    await assert.rejects(
      cible.query(
        "insert into pieces(dossier_id,type,chemin,taille_octets,type_reel) values($1,'bulletin_paie',$2,0,'application/pdf')",
        [id, `${id}/${randomUUID()}`],
      ),
      { code: '23514' },
    )
    async function devenir(partie, jti) {
      await cible.query('reset role')
      await cible.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ role: 'porteur_lien', role_partie: partie, dossier_id: id, jti }),
      ])
      await cible.query('set role porteur_lien')
    }
    await devenir('locataire', locataire)
    assert.equal((await cible.query('select * from pieces')).rowCount, 0)
    assert.equal((await cible.query('select * from cles_dossier')).rowCount, 0)
    await devenir('garant', randomUUID())
    assert.equal((await cible.query('select * from pieces')).rowCount, 0)
    await devenir('garant', garant)
    assert.deepEqual((await cible.query('select chemin from pieces')).rows, [{ chemin }])
    const cleScellee = (await cible.query('select cle_scellee from cles_dossier')).rows[0]
      .cle_scellee
    const objet = await readFile(join(extraction, 'objets', chemin))
    assert.equal(sha256(objet), contrat.objets[0].sha256)
    assert.deepEqual(ouvrir(objet, ouvrir(cleScellee, kek)), original)
    assert.throws(() => ouvrir(cleScellee, nouvelleCle()))
    await cible.query('reset role; set role anon')
    await assert.rejects(cible.query('select public.purger_les_dossiers_expires()'), {
      code: '42501',
    })
    await cible.query('reset role')
    // Sabotages sur cette seule copie fictive : chaque verification doit detecter la perte.
    for (const sabotage of [
      'alter table pieces disable row level security',
      'revoke anon from authenticator',
    ]) {
      await cible.query('begin')
      try {
        await cible.query(sabotage)
        const altere = await photographier(cible)
        assert.throws(() => comparer(attendu, altere), 'Sabotage non detecte')
      } finally {
        await cible.query('rollback')
      }
    }
    const altere = Buffer.from(objet)
    altere[altere.length - 1] ^= 1
    assert.throws(() => ouvrir(altere, ouvrir(cleScellee, kek)), 'Objet altere non detecte')
    comparer(attendu, await photographier(cible))
    return {
      tables: attendu.tables.length,
      contraintes: attendu.contraintes.length,
      politiques: attendu.politiques.length,
      fonctions: attendu.fonctions.length,
      sabotagesRefuses: 3,
      authFictif: true,
      objetDechiffre: true,
      dureeMs: Date.now() - debut,
    }
  } finally {
    try {
      if (autorise) {
        const nettoyages = await Promise.allSettled(
          [source, cible].map(async (db) => {
            await nettoyerSchemas(db)
            await nettoyerRoles(db)
          }),
        )
        assert(
          nettoyages.every((n) => n.status === 'fulfilled'),
          'Nettoyage des fixtures incomplet',
        )
      }
    } finally {
      await Promise.allSettled([
        sourceConnectee ? source.end() : Promise.resolve(),
        cibleConnectee ? cible.end() : Promise.resolve(),
      ])
      if (repertoire) await rm(repertoire, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const resultat = await verifierRestaurationPostgres({
      source: process.env.PG_RESTAURATION_SOURCE,
      cible: process.env.PG_RESTAURATION_CIBLE,
      conteneurSource: process.env.PG_RESTAURATION_CONTENEUR_SOURCE,
      conteneurCible: process.env.PG_RESTAURATION_CONTENEUR_CIBLE,
      clients: process.env.PG_RESTAURATION_CLIENTS,
    })
    console.log(JSON.stringify(resultat))
  } catch (erreur) {
    if (
      /^Restauration differente : (tables|contraintes|politiques|fonctions|roles|adhesions)$/.test(
        erreur?.message ?? '',
      )
    )
      console.error(erreur.message)
    console.error(
      'Exercice de restauration refuse ou incomplet. Verifier les clusters jetables et les clients17 ; aucune sortie de dump journalisee.',
    )
    process.exitCode = 1
  }
}
