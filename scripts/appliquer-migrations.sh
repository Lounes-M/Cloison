#!/usr/bin/env bash
# Applique a la base les migrations de supabase/migrations/ qui ne le sont pas
# encore, dans l'ordre, une transaction par migration.
#
# Le registre est celui de Supabase (supabase_migrations.schema_migrations),
# hors du schema public : l'empreinte du schema n'en depend pas.
#
#   verifier            liste ce qui reste a appliquer, sans rien appliquer
#   appliquer           applique ce qui reste, dans l'ordre des numeros ;
#                       s'arrete a la premiere erreur
#   reference <liste>   inscrit comme deja appliquees, sans les executer, les
#                       migrations de la liste : des numeros et des intervalles
#                       separes par des virgules, par exemple 0001-0063,0083
#                       (premiere mise en service sur une base deja migree a
#                       la main, meme avec des trous)
#
# L'adresse de la base vient de MIGRATIONS_DATABASE_URL : une connexion
# directe ou de session, jamais le pooler en mode transaction.
set -euo pipefail

operation="${1:-verifier}"
reference="${2:-}"
dossier="${MIGRATIONS_DOSSIER:-$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations}"

if [ -z "${MIGRATIONS_DATABASE_URL:-}" ]; then
  echo "MIGRATIONS_DATABASE_URL manque." >&2
  exit 2
fi

export PGCONNECT_TIMEOUT=15
export PGAPPNAME=cloison-migrations
sql() {
  psql --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
    --dbname "$MIGRATIONS_DATABASE_URL" "$@"
}

sql <<'SQL'
set client_min_messages = warning;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

mapfile -t fichiers < <(find "$dossier" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)
if [ "${#fichiers[@]}" -eq 0 ]; then
  echo "Aucune migration dans $dossier." >&2
  exit 2
fi
for fichier in "${fichiers[@]}"; do
  if ! [[ "$fichier" =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]]; then
    echo "Nom de migration inattendu : $fichier" >&2
    exit 2
  fi
done

mapfile -t appliquees < <(sql -c 'select version from supabase_migrations.schema_migrations order by version')
derniere=""
[ "${#appliquees[@]}" -gt 0 ] && derniere="${appliquees[-1]}"
est_appliquee() {
  local v
  for v in "${appliquees[@]}"; do [ "$v" = "$1" ] && return 0; done
  return 1
}

en_attente=()
for fichier in "${fichiers[@]}"; do
  est_appliquee "${fichier%%_*}" || en_attente+=("$fichier")
done

case "$operation" in
  verifier)
    echo "Appliquees : ${#appliquees[@]}. En attente : ${#en_attente[@]}."
    [ "${#en_attente[@]}" -gt 0 ] && printf '  %s\n' "${en_attente[@]}"
    exit 0
    ;;

  reference)
    if ! [[ "$reference" =~ ^[0-9]{4}(-[0-9]{4})?(,[0-9]{4}(-[0-9]{4})?)*$ ]]; then
      echo "Liste attendue : numeros et intervalles sur quatre chiffres, par exemple 0001-0063,0083." >&2
      exit 2
    fi
    dans_la_liste() {
      local element debut fin
      for element in ${reference//,/ }; do
        debut="${element%-*}"
        fin="${element#*-}"
        if [[ ! "$1" < "$debut" && ! "$1" > "$fin" ]]; then return 0; fi
      done
      return 1
    }
    # Chaque numero ou borne doit exister : une faute de frappe ne passe pas.
    for element in ${reference//,/ }; do
      for borne in "${element%-*}" "${element#*-}"; do
        if ! printf '%s\n' "${fichiers[@]}" | grep -q "^${borne}_"; then
          echo "Aucune migration $borne dans le depot." >&2
          exit 2
        fi
      done
    done
    inscrites=0
    for fichier in "${en_attente[@]}"; do
      version="${fichier%%_*}"
      dans_la_liste "$version" || continue
      nom="${fichier#*_}"
      sql -v version="$version" -v nom="${nom%.sql}" <<'SQL'
insert into supabase_migrations.schema_migrations(version, name)
values (:'version', :'nom') on conflict do nothing;
SQL
      inscrites=$((inscrites + 1))
    done
    echo "Reference $reference : $inscrites migration(s) inscrite(s) sans execution."
    exit 0
    ;;

  appliquer)
    if [ "${#appliquees[@]}" -eq 0 ]; then
      echo "Registre vide : la base a peut-etre deja ete migree a la main." >&2
      echo "Lancer d'abord « reference <liste> » avec les migrations deja en place." >&2
      exit 1
    fi
    if [ "${#en_attente[@]}" -eq 0 ]; then
      echo "Rien a appliquer."
      exit 0
    fi
    # Les branches fusionnent dans le desordre : une migration plus ancienne
    # que la derniere appliquee passe quand meme, a son rang, et se signale.
    for fichier in "${en_attente[@]}"; do
      if [[ "${fichier%%_*}" < "$derniere" ]]; then
        echo "Note : $fichier est anterieure a la derniere appliquee ($derniere)."
      fi
    done
    for fichier in "${en_attente[@]}"; do
      version="${fichier%%_*}"
      nom="${fichier#*_}"
      echo "Application de $fichier"
      # Une seule transaction : la migration et son inscription au registre
      # reussissent ou echouent ensemble.
      sql --single-transaction -v version="$version" -v nom="${nom%.sql}" \
        -c "set local lock_timeout = '10s'" \
        -f "$dossier/$fichier" \
        -f - <<'SQL'
insert into supabase_migrations.schema_migrations(version, name) values (:'version', :'nom');
SQL
    done
    echo "${#en_attente[@]} migration(s) appliquee(s)."
    ;;

  *)
    echo "Operation inconnue : $operation (verifier, appliquer, reference)." >&2
    exit 2
    ;;
esac
