import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

/**
 * Une base Postgres jetable, pour eprouver les politiques RLS.
 *
 * PGlite est un vrai Postgres compile en WebAssembly : les roles, les
 * politiques et les claims se comportent comme sur le serveur. Aucun conteneur
 * a lancer, ni en local ni dans la CI, donc aucune raison de sauter les tests
 * parce que Docker n'est pas demarre.
 *
 * Chaque base est neuve : les essais ne se marchent pas dessus et leur ordre
 * n'a aucune importance.
 */

const racine = join(import.meta.dirname, '..')

function lire(...chemin: string[]) {
  return readFileSync(join(racine, ...chemin), 'utf8')
}

/** Les migrations, dans l'ordre de leur numero, jamais dans celui du disque. */
function migrations() {
  return readdirSync(join(racine, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => lire('supabase', 'migrations', f))
}

export async function baseDEssai(): Promise<PGlite> {
  // PGlite n'embarque pas `pgcrypto` par defaut, alors que le harnais
  // l'installe comme le fait Supabase. On le fournit ici plutot que de
  // retirer la ligne du harnais : celui-ci sert aussi aux essais manuels sur
  // un vrai Postgres, ou l'extension est bien necessaire.
  const db = new PGlite({ extensions: { pgcrypto } })

  // Le harnais reproduit ce que Supabase pose avant nos migrations. Il est
  // deja dans le depot et sert aussi aux essais manuels : les tests et la main
  // s'appuient sur exactement le meme faux.
  await db.exec(lire('supabase', 'essais', 'harnais-supabase.sql'))

  for (const migration of migrations()) {
    await db.exec(migration)
  }

  return db
}

/**
 * Le role Postgres et l'utilisateur courants.
 *
 * `set` sans `local` porte sur la session, et PGlite n'en tient qu'une : le
 * reglage vaut donc jusqu'au prochain appel, exactement comme dans les essais
 * manuels en psql. C'est la nuance qui compte : `set_config(..., true)` serait
 * perdu des la requete suivante, chacune etant sa propre transaction.
 */
export async function devenir(
  db: PGlite,
  role: 'anon' | 'authenticated' | 'porteur_lien' | 'serveur',
  sub?: string,
) {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role, sub, aal: 'aal2' }),
  ])
}

/** Repasse en superutilisateur, qui contourne RLS et voit donc la verite. */
export async function redevenirProprietaire(db: PGlite) {
  await db.exec('reset role')
  await db.exec(`set request.jwt.claims = '{}'`)
}

/**
 * Joue une requete en attendant qu'elle echoue.
 *
 * Les refus sont ce qu'on vient observer : une politique ne se teste pas en
 * verifiant qu'elle laisse passer, mais qu'elle arrete. Renvoie le message,
 * pour que le test puisse dire pourquoi c'est refuse et pas seulement que ca
 * l'est.
 */
export async function refus(db: PGlite, sql: string): Promise<string> {
  try {
    await db.query(sql)
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message : String(erreur)
  }
  throw new Error(`Cette requete aurait du etre refusee : ${sql}`)
}

/** Le nombre de lignes qu'un role voit reellement, RLS appliquee. */
export async function compter(db: PGlite, table: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)
  return rows[0]?.n ?? 0
}

/**
 * Le nombre de lignes qu'une ecriture a reellement touchees.
 *
 * Postgres a deux facons de refuser, et les confondre produit des tests qui ne
 * prouvent rien :
 *
 *   - **Les droits refusent bruyamment.** Sans `grant`, la requete leve
 *     « permission denied » : c'est ce qu'on observe avec `refus()`.
 *   - **La RLS filtre en silence.** Avec le droit mais sans politique
 *     correspondante, la requete reussit et ne touche aucune ligne. Aucune
 *     erreur n'est levee.
 *
 * Un test qui se contenterait de constater l'absence d'exception passerait donc
 * alors meme que la ligne aurait ete supprimee. D'ou cette fonction : sur une
 * ecriture filtree par RLS, on verifie le compte, pas l'absence d'erreur.
 */
export async function lignesTouchees(db: PGlite, sql: string): Promise<number> {
  const resultat = await db.query(sql)
  return resultat.affectedRows ?? 0
}

/** Fixture de capacite active. Le jeton est cree en proprietaire, puis seule
 * la requete sous porteur_lien mesure les droits. Aucun claim scalaire. */
export async function devenirPorteur(db: PGlite, dossierId: string, partie: string) {
  await redevenirProprietaire(db)
  const { rows } = await db.query<{ jti: string }>(
    `insert into public.jetons_actifs(dossier_id, partie, jti, expire_le)
     values ($1, $2, gen_random_uuid(), now() + interval '7 days')
     on conflict (dossier_id, partie) do update set jti=excluded.jti, expire_le=excluded.expire_le
     returning jti`,
    [dossierId, partie],
  )
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({
      role: 'porteur_lien',
      dossier_id: dossierId,
      role_partie: partie,
      jti: rows[0]!.jti,
    }),
  ])
  await db.exec('set role porteur_lien')
}
