#!/usr/bin/env bash
# Applique a la base les migrations de supabase/migrations/ qui ne le sont pas
# encore, dans l'ordre, une transaction par migration.
#
# Le registre est celui de Supabase (supabase_migrations.schema_migrations),
# hors du schema public : l'empreinte du schema n'en depend pas.
#
#   verifier            liste ce qui reste a appliquer, sans rien ecrire
#   appliquer           applique ce qui reste ; s'arrete a la premiere erreur
#   reference <version> inscrit comme deja appliquees les migrations jusqu'a
#                       <version> incluse, sans les executer (premiere mise en
#                       service sur une base deja migree a la main)
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
    if ! [[ "$reference" =~ ^[0-9]{4}$ ]]; then
      echo "Version de reference attendue sur quatre chiffres, par exemple 0084." >&2
      exit 2
    fi
    if [ ! -f "$dossier/$(printf '%s\n' "${fichiers[@]}" | grep "^${reference}_" || echo absente)" ]; then
      echo "Aucune migration $reference dans le depot." >&2
      exit 2
    fi
    inscrites=0
    for fichier in "${en_attente[@]}"; do
      version="${fichier%%_*}"
      [[ "$version" > "$reference" ]] && continue
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
      echo "Lancer d'abord « reference <version> » avec la derniere migration deja en place." >&2
      exit 1
    fi
    if [ "${#en_attente[@]}" -eq 0 ]; then
      echo "Rien a appliquer."
      exit 0
    fi
    # Une migration plus ancienne que la derniere appliquee est un trou dans
    # l'historique : on ne devine pas, on s'arrete.
    for fichier in "${en_attente[@]}"; do
      if [[ "${fichier%%_*}" < "$derniere" ]]; then
        echo "Migration $fichier anterieure a la derniere appliquee ($derniere) : a examiner." >&2
        exit 1
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
