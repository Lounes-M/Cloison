import { verifierRemiseDroits } from './verifier-remise-droits.mjs'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { openSync, closeSync } from 'node:fs'
import { mkdtemp, realpath, writeFile, readFile, mkdir, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { lireApprobationExport } from './approbation-export-droits.mjs'
import { ouvrirPaquetDroits } from './paquet-droits.mjs'
import { verifierSuiviExport } from './suivi-export-droits.mjs'

/** Recette exclusivement sur la base locale jetable du harnais. */
export async function verifierExportApprouve(db, connexion) {
  const url = new URL(connexion)
  assert(
    ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/cloison_audit_test',
  )
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  assert(['linux', 'darwin'].includes(process.platform))
  const racine = await mkdtemp(join(await realpath(tmpdir()), 'cloison-export-approuve-'))
  const cle = randomBytes(32)
  let fd
  try {
    const contenu = Buffer.from('Contenu fictif relu pour le demandeur')
    const a = {
      version: 1,
      usage: 'export-personnel',
      demande: randomUUID(),
      revision: randomUUID(),
      operateur: randomUUID(),
      nature: 'acces',
      destinataire: {
        reference: randomUUID(),
        identiteSha256: 'c'.repeat(64),
        mandat: 'non_requis',
      },
      inventaireComplet: true,
      revueTiersValidee: true,
      creeLe: new Date(Date.now() - 1000).toISOString(),
      expireLe: new Date(Date.now() + 600000).toISOString(),
      exclusions: ['tiers'],
      fichiers: [
        {
          nom: 'donnees-0001.txt',
          taille: contenu.length,
          sha256: createHash('sha256').update(contenu).digest('hex'),
        },
      ],
    }
    const brut = JSON.stringify(a)
    const d = lireApprobationExport(brut).decision
    const premiere = randomUUID()
    await db.query(
      `insert into suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
      values($1,$2,$3,'acces','recue',clock_timestamp(),clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',repeat('a',64))`,
      [premiere, a.demande, a.operateur],
    )
    await db.query(
      `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
      select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2 from suivi_demandes_droits where operation=$3`,
      [a.revision, d.decisionSha256, premiere],
    )
    await mkdir(join(racine, 'source'), { mode: 0o700 })
    await writeFile(join(racine, 'source', a.fichiers[0].nom), contenu, { mode: 0o600 })
    await writeFile(join(racine, 'approbation.json'), brut, { mode: 0o600 })
    await writeFile(join(racine, 'cle'), cle, { mode: 0o600 })
    fd = openSync(join(racine, 'cle'), 'r')
    const executer = (commande, source, destination) =>
      spawnSync(
        process.execPath,
        [
          resolve('scripts/exporter-droits.mjs'),
          commande,
          join(racine, 'approbation.json'),
          join(racine, source),
          join(racine, destination),
          '--suivi',
        ],
        {
          input: JSON.stringify({ connexion }),
          stdio: ['pipe', 'pipe', 'pipe', fd],
          encoding: 'utf8',
          timeout: 20000,
        },
      )
    const creer = executer('creer', 'source', 'paquet')
    assert.equal(creer.status, 0, 'Creation CLI approuvee refusee')
    assert.deepEqual(Object.keys(JSON.parse(creer.stdout)).sort(), ['fichiers', 'sha256'])
    const ouvert = ouvrirPaquetDroits(await readFile(join(racine, 'paquet')), cle, d)
    try {
      assert.deepEqual(ouvert.fichiers.get(a.fichiers[0].nom), contenu)
    } finally {
      for (const b of ouvert.fichiers.values()) b.fill(0)
    }
    const extraire = executer('extraire', 'paquet', 'sortie')
    assert.equal(extraire.status, 0, 'Extraction CLI approuvee refusee')
    assert.deepEqual(await readFile(join(racine, 'sortie', a.fichiers[0].nom)), contenu)
    // L'approbation et sa preuve d'identite ne sont pas copiees dans le manifeste remis.
    assert.deepEqual(
      JSON.parse(await readFile(join(racine, 'sortie', 'manifeste.json'), 'utf8')),
      d,
    )
    await verifierRemiseDroits(db, connexion, brut, await readFile(join(racine, 'paquet')), cle)
    for (const role of [
      'anon',
      'authenticated',
      'porteur_lien',
      'serveur',
      'depot_piece',
      'service_role',
    ]) {
      await db.query(`set role ${role}`)
      try {
        await assert.rejects(verifierSuiviExport(db, d, brut), /Decision export indisponible/)
      } finally {
        await db.query('reset role')
      }
    }
    await writeFile(
      join(racine, 'approbation.json'),
      JSON.stringify({ ...a, destinataire: { ...a.destinataire, reference: randomUUID() } }),
      { mode: 0o600 },
    )
    const substitution = executer('creer', 'source', 'substitution')
    assert.equal(substitution.status, 1, 'Substitution de destinataire acceptee')
    assert.equal(substitution.stdout, '')
    await assert.rejects(access(join(racine, 'substitution')))
    await writeFile(join(racine, 'approbation.json'), brut, { mode: 0o600 })
    await db.query(
      `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
      select $1,demande,operation,operateur,nature,'identite_a_verifier',recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$2`,
      [randomUUID(), a.revision],
    )
    const revoquee = executer('extraire', 'paquet', 'revoquee')
    assert.equal(revoquee.status, 1, 'Extraction apres revocation acceptee')
    await assert.rejects(access(join(racine, 'revoquee')))
    for (const r of [creer, extraire, substitution, revoquee]) {
      for (const prive of [
        a.demande,
        a.destinataire.reference,
        a.destinataire.identiteSha256,
        connexion,
        contenu.toString(),
        racine,
      ])
        assert(!(r.stdout + r.stderr).includes(prive), 'Journal contenant une donnee privee')
    }
  } finally {
    if (fd !== undefined) closeSync(fd)
    cle.fill(0)
    await rm(racine, { recursive: true, force: true })
  }
}
