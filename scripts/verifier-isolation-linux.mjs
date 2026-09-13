import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'
import { commandeDocker } from './commande-docker-documentaire.mjs'
import { profilConteneur } from './profil-conteneur-documentaire.mjs'
import { traiterDocumentIsole } from './traiter-document-isole.mjs'

const image = process.argv[2]
const creerNom = () => 'cloison-document-' + randomUUID()
profilConteneur(image, creerNom())
const decoder = (octets) => JSON.parse(octets.toString('utf8'))
async function etat(nom) {
  return decoder(await commandeDocker(['inspect', '--format', '{{json .State}}', nom]))
}
async function sonde(code, inspecter = async () => {}, modifier = (v) => v) {
  const nom = creerNom()
  const profil = modifier(profilConteneur(image, nom))
  profil.splice(profil.length - 1, 0, '--entrypoint=/usr/bin/timeout')
  await commandeDocker([...profil, '--signal=KILL', '15s', '/usr/local/bin/node', '-e', code])
  try {
    const config = decoder(
      await commandeDocker(['inspect', '--format', '{{json .HostConfig}}', nom], undefined, 20000),
    )
    assert.equal(config.LogConfig.Type, 'none')
    assert.equal(config.NetworkMode, 'none')
    assert.equal(config.ReadonlyRootfs, true)
    assert.equal(config.Privileged, false)
    assert.equal(config.Memory, 384 * 1024 * 1024)
    assert.equal(config.MemorySwap, config.Memory)
    assert.equal(config.PidsLimit, 64)
    assert.equal(config.NanoCpus, 1e9)
    assert.deepEqual(
      decoder(await commandeDocker(['inspect', '--format', '{{json .Mounts}}', nom])),
      [],
    )
    let resultat
    try {
      resultat = await commandeDocker(
        ['start', '--attach', '--interactive', nom],
        undefined,
        30 * 1024 * 1024,
        20000,
      )
    } catch {
      resultat = null
    }
    await inspecter(await etat(nom), resultat)
  } finally {
    await commandeDocker(['rm', '--force', nom])
  }
}

await sonde(
  `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
assert.equal(process.getuid(), 65532);
assert(Object.keys(os.networkInterfaces()).every(n => n === 'lo'));
for (const p of ['/var/run/docker.sock','/moteur/.env','/moteur/.git','/moteur/lib']) assert.throws(() => fs.readFileSync(p), {code:'ENOENT'});
assert.throws(() => fs.writeFileSync('/tmp/sonde', 'fictif'), {code:'EROFS'});
assert.throws(() => fs.writeFileSync('/moteur/sonde', 'fictif'), {code:'EROFS'});
const status = fs.readFileSync('/proc/self/status','utf8');
assert(/^NoNewPrivs:\\s*1$/m.test(status));
assert(/^Seccomp:\\s*2$/m.test(status));
assert(/^CapEff:\\s*0+$/m.test(status));
assert.equal(fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(), String(384*1024*1024));
assert.equal(fs.readFileSync('/sys/fs/cgroup/memory.swap.max','utf8').trim(),'0');
assert.equal(process.env.CLOISON_SECRET_FICTIF, undefined);
const s = require('node:net').connect({host:'192.0.2.1',port:443});
s.setTimeout(1000, () => { throw new Error('Reseau non refuse immediatement') });
s.on('connect', () => { throw new Error('Connexion interdite') });
s.on('error', e => { assert(['ENETUNREACH','EHOSTUNREACH'].includes(e.code)); s.destroy(); });
`,
  async (state, resultat) => {
    assert.equal(state.ExitCode, 0)
    assert.notEqual(resultat, null)
  },
)
console.log('OK : compte, fichiers, absence de montage et de secret, reseau et contraintes noyau')

await sonde(
  `const blocs=[]; for(let i=0;i<20;i++) blocs.push(Buffer.alloc(32*1024*1024,7));`,
  async (state, resultat) => {
    assert.equal(resultat, null)
    assert.equal(state.OOMKilled, true, 'Le noyau doit refuser la memoire native')
    assert.equal(state.ExitCode, 137)
  },
)
console.log('OK : depassement natif effectivement interrompu par le noyau')

await sonde(
  `
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
spawnSync('/bin/sh',['-c','i=0; while [ "$i" -lt 80 ]; do sleep 2 & i=$((i+1)); done; wait'],{stdio:'ignore'});
assert(/^max\\s+[1-9]\\d*/m.test(fs.readFileSync('/sys/fs/cgroup/pids.events','utf8')));
`,
  async (state, resultat) => {
    assert.equal(state.ExitCode, 0)
    assert.notEqual(resultat, null)
  },
)
console.log('OK : plafond de processus et descendants effectivement applique')

const avant = Date.now()
await sonde('for (;;) {}', async (state, resultat) => {
  assert.equal(resultat, null)
  assert.equal(state.OOMKilled, false)
  assert.equal(state.ExitCode, 137)
  assert(Date.now() - avant < 20000, 'Arret interne trop tardif')
})
console.log('OK : duree interne bornee, independamment du client')

await sonde('process.stdout.write(Buffer.alloc(31*1024*1024))', async (_state, resultat) => {
  assert.equal(resultat, null, 'Sortie excessive acceptee')
})
console.log('OK : sortie excessive refusee et conteneur supprime')

const document = await PDFDocument.create()
document.addPage([200, 200])
const pdf = Buffer.from(await document.save())
const demande = (contenu, type, operation = 'verifier') =>
  Buffer.from(
    JSON.stringify({
      operation,
      type,
      contenu: contenu.toString('base64'),
      filigrane: 'Agence fictive',
    }),
  )
for (const type of ['application/pdf', 'image/png', 'image/jpeg']) {
  const contenu = type === 'application/pdf' ? pdf : createCanvas(80, 80).toBuffer(type)
  assert.equal((await traiterDocumentIsole(demande(contenu, type), image)).length, 0)
  const rendu = await traiterDocumentIsole(demande(contenu, type, 'rasteriser'), image)
  assert.equal((await PDFDocument.load(rendu)).getPageCount(), 1)
}
await assert.rejects(
  traiterDocumentIsole(demande(Buffer.from('%PDF-invalide'), 'application/pdf'), image),
)
assert.equal((await traiterDocumentIsole(demande(pdf, 'application/pdf'), image)).length, 0)
console.log('OK : vrai moteur PDF PNG JPEG, rasterisation, document malforme et reprise')

// Contre-preuves natives : le garde initial doit refuser un profil relache.
for (const retirer of [
  '--read-only',
  '--network=none',
  '--cap-drop=ALL',
  '--memory=384m',
  '--pids-limit=64',
]) {
  const nom = creerNom()
  let profil = profilConteneur(image, nom).filter((v) => v !== retirer)
  if (retirer === '--memory=384m') profil = profil.filter((v) => v !== '--memory-swap=384m')
  await commandeDocker(profil)
  try {
    await assert.rejects(
      commandeDocker(
        ['start', '--attach', '--interactive', nom],
        demande(pdf, 'application/pdf'),
        4096,
        20000,
      ),
      `Profil relache accepte : ${retirer}`,
    )
    assert.notEqual((await etat(nom)).ExitCode, 0)
  } finally {
    await commandeDocker(['rm', '--force', nom])
  }
}
console.log('OK : cinq profils relaches refuses avant decodage')
