// Regenere tests/fixtures/2ddoc.json : autorites, certificats et codes FICTIFS.
//
// Usage : node scripts/fixture-2ddoc.mjs   (OpenSSL 3 requis, uniquement ici)
//
// Les cles privees vivent dans un repertoire temporaire efface en fin de
// script : seuls des certificats et des codes deja signes sont versionnes.
// Aucun de ces certificats n'est reconnu par l'ANTS ; ils ne valident rien
// hors des essais, qui les injectent a la place des autorites reelles.
import { execFileSync } from 'node:child_process'
import { createPrivateKey, sign, X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dossier = mkdtempSync(join(tmpdir(), 'cloison-2ddoc-'))
const ssl = (...args) => execFileSync('openssl', args, { cwd: dossier, stdio: 'pipe' })
const lire = (nom) => readFileSync(join(dossier, nom))

writeFileSync(
  join(dossier, 'ca.cnf'),
  `[ca]\ndefault_ca=a\n[a]\ndatabase=index.txt\nnew_certs_dir=.\nserial=serial\ndefault_md=sha256\ndefault_crl_days=30\npolicy=p\nunique_subject=no\n[p]\ncommonName=supplied\norganizationName=optional\ncountryName=optional\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n[v3_feuille]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\ncrlDistributionPoints=URI:http://crl.zz01.invalid/zz01.crl\n[v3_sans_liste]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n[crl_autorites]\nissuingDistributionPoint=critical,@idp\n[idp]\nonlyCA=TRUE\n`,
)
writeFileSync(join(dossier, 'index.txt'), '')
writeFileSync(join(dossier, 'serial'), '1000\n')

function creerAutorite(code, nom = code) {
  ssl('genrsa', '-out', `${code}.key`, '2048')
  ssl(
    'req',
    '-new',
    '-key',
    `${code}.key`,
    '-subj',
    `/C=FR/O=Autorite fictive/CN=${nom}`,
    '-out',
    `${code}.csr`,
  )
  ssl(
    'ca',
    '-batch',
    '-config',
    'ca.cnf',
    '-selfsign',
    '-keyfile',
    `${code}.key`,
    '-in',
    `${code}.csr`,
    '-extensions',
    'v3_ca',
    '-startdate',
    '20200101000000Z',
    '-enddate',
    '20400101000000Z',
    '-out',
    `${code}.pem`,
    '-notext',
  )
  return new X509Certificate(lire(`${code}.pem`)).toString()
}

function creerFeuille(nom, autoriteCode, cle, debut, fin, organisation, extensions = 'v3_feuille') {
  if (cle === 'rsa') ssl('genrsa', '-out', `${nom}.key`, '2048')
  else ssl('ecparam', '-name', cle, '-genkey', '-noout', '-out', `${nom}.key`)
  ssl(
    'req',
    '-new',
    '-key',
    `${nom}.key`,
    '-subj',
    `/C=FR/O=${organisation}/CN=${nom}`,
    '-out',
    `${nom}.csr`,
  )
  ssl(
    'ca',
    '-batch',
    '-config',
    'ca.cnf',
    '-cert',
    `${autoriteCode}.pem`,
    '-keyfile',
    `${autoriteCode}.key`,
    '-in',
    `${nom}.csr`,
    '-extensions',
    extensions,
    '-startdate',
    debut,
    '-enddate',
    fin,
    '-out',
    `${nom}.pem`,
    '-notext',
  )
  return new X509Certificate(lire(`${nom}.pem`)).raw.toString('base64')
}

/** Liste de revocation de l'autorite, en DER. Les dates sont fixees : les essais figent l'horloge. */
function creerListe(nom, autoriteCode, debut, fin, extensions) {
  ssl(
    'ca',
    '-config',
    'ca.cnf',
    '-gencrl',
    '-cert',
    `${autoriteCode}.pem`,
    '-keyfile',
    `${autoriteCode}.key`,
    '-crl_lastupdate',
    debut,
    '-crl_nextupdate',
    fin,
    ...(extensions ? ['-crlexts', extensions] : []),
    '-out',
    `${nom}.crl.pem`,
  )
  ssl('crl', '-in', `${nom}.crl.pem`, '-outform', 'DER', '-out', `${nom}.crl`)
  return lire(`${nom}.crl`).toString('base64')
}

function revoquer(nom, autoriteCode) {
  ssl(
    'ca',
    '-config',
    'ca.cnf',
    '-revoke',
    `${nom}.pem`,
    '-cert',
    `${autoriteCode}.pem`,
    '-keyfile',
    `${autoriteCode}.key`,
  )
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32(octets) {
  let bits = 0,
    tampon = 0,
    sortie = ''
  for (const octet of octets) {
    tampon = (tampon << 8) | octet
    bits += 8
    while (bits >= 5) {
      bits -= 5
      sortie += BASE32[(tampon >> bits) & 31]
    }
    tampon &= (1 << bits) - 1
  }
  if (bits) sortie += BASE32[(tampon << (5 - bits)) & 31]
  return sortie
}
const jours = (date) =>
  Math.round((Date.parse(date) - Date.UTC(2000, 0, 1)) / 86_400_000)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')

function signer(nom, condensat, autoriteCode, identifiant, type, champs, date = '2025-07-31') {
  const signe = Buffer.from(
    `DC04${autoriteCode}${identifiant}FFFF${jours(date)}${type}01FR${champs}`,
    'latin1',
  )
  const signature = sign(condensat, signe, {
    key: createPrivateKey(lire(`${nom}.key`)),
    dsaEncoding: 'ieee-p1363',
  })
  return Buffer.concat([signe, Buffer.from('\x1f' + base32(signature), 'latin1')]).toString(
    'base64',
  )
}

try {
  const AVIS =
    '432.5\x1d4425B1234567890452024' +
    '46MME DUPONT MARIE\x1d47123456789012348M DUPONT JEAN\x1d491234567890124' +
    '4A31072025' +
    '4131250\x1d'
  const sortie = {
    avertissement:
      'Certificats et codes fictifs, generes par scripts/fixture-2ddoc.mjs. Aucune cle privee.',
    // HOMONYME porte le meme nom que ZZ01 avec une autre cle : seule la signature les distingue.
    autorites: {
      ZZ01: creerAutorite('ZZ01'),
      ZZ02: creerAutorite('ZZ02'),
      HOMONYME: creerAutorite('HOMONYME', 'ZZ01'),
    },
    certificats: {
      AV01: creerFeuille(
        'AV01',
        'ZZ01',
        'prime256v1',
        '20240101000000Z',
        '20270101000000Z',
        'Emetteur fictif des impots',
      ),
      AV02: creerFeuille(
        'AV02',
        'ZZ01',
        'prime256v1',
        '20200101000000Z',
        '20210101000000Z',
        'Emetteur fictif perime',
      ),
      AV03: creerFeuille(
        'AV03',
        'ZZ02',
        'prime256v1',
        '20240101000000Z',
        '20270101000000Z',
        'Emetteur fictif etranger',
      ),
      AV04: creerFeuille(
        'AV04',
        'ZZ01',
        'secp384r1',
        '20240101000000Z',
        '20270101000000Z',
        'Emetteur fictif P-384',
      ),
      AV05: creerFeuille(
        'AV05',
        'ZZ01',
        'rsa',
        '20240101000000Z',
        '20270101000000Z',
        'Emetteur fictif RSA',
      ),
      AV06: creerFeuille(
        'AV06',
        'ZZ01',
        'prime256v1',
        '20240101000000Z',
        '20270101000000Z',
        'Emetteur fictif revoque',
      ),
      AV07: creerFeuille(
        'AV07',
        'ZZ01',
        'prime256v1',
        '20240101000000Z',
        '20270101000000Z',
        'Emetteur fictif sans liste',
        'v3_sans_liste',
      ),
    },
    listes: {},
    codes: {},
  }
  revoquer('AV06', 'ZZ01')
  // Toutes citent AV06. Seule `valide` est retenue : les autres sont perimee,
  // signee par l'homonyme, ou limitee aux certificats d'autorites.
  sortie.listes = {
    valide: creerListe('valide', 'ZZ01', '20250801000000Z', '20350101000000Z'),
    perimee: creerListe('perimee', 'ZZ01', '20250701000000Z', '20250801000000Z'),
    homonyme: creerListe('homonyme', 'HOMONYME', '20250801000000Z', '20350101000000Z'),
    autorites: creerListe(
      'autorites',
      'ZZ01',
      '20250801000000Z',
      '20350101000000Z',
      'crl_autorites',
    ),
  }
  sortie.codes = {
    avis: signer('AV01', 'sha256', 'ZZ01', 'AV01', '28', AVIS),
    avisP384: signer('AV04', 'sha384', 'ZZ01', 'AV04', '28', AVIS),
    avisChampInconnu: signer(
      'AV01',
      'sha256',
      'ZZ01',
      'AV01',
      '28',
      '452024' + 'ZZinconnu\x1d' + '4131250\x1d',
    ),
    facture: signer('AV01', 'sha256', 'ZZ01', 'AV01', '01', '10MME DUPONT MARIE\x1d'),
    perime: signer('AV02', 'sha256', 'ZZ01', 'AV02', '28', AVIS),
    // Signe par un emetteur d'une autre autorite, mais presente sous ZZ01.
    etranger: signer('AV03', 'sha256', 'ZZ01', 'AV03', '28', AVIS),
    revoque: signer('AV06', 'sha256', 'ZZ01', 'AV06', '28', AVIS),
    sansListe: signer('AV07', 'sha256', 'ZZ01', 'AV07', '28', AVIS),
    futur: signer('AV01', 'sha256', 'ZZ01', 'AV01', '28', AVIS, '2026-12-31'),
  }
  writeFileSync('tests/fixtures/2ddoc.json', JSON.stringify(sortie, null, 2) + '\n')
  console.log('OK : tests/fixtures/2ddoc.json regenere, cles privees effacees')
} finally {
  rmSync(dossier, { recursive: true, force: true })
}
