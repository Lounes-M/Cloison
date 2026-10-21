#!/usr/bin/env bash
# Met en service ou met a jour le moteur confine depuis un clone relu du depot.
# A lancer en root sur l'hote dedie : sudo infra/documentaire/hote/mettre-en-service.sh
set -euo pipefail
umask 077

refuser() {
  echo "Mise en service refusee : $1" >&2
  exit 1
}

racine=$(cd "$(dirname "$0")/../../.." && pwd)
cible=/opt/cloison-documentaire
conf=/etc/cloison-documentaire
fichiers=(
  scripts/service-documentaire.mjs
  scripts/traiter-document-isole.mjs
  scripts/commande-docker-documentaire.mjs
  scripts/profil-conteneur-documentaire.mjs
  lib/coffre/protocole-documentaire.ts
  lib/coffre/reponse-document.ts
)

[ "$(id -u)" = 0 ] || refuser "lancer en root"
[ "$(uname -s)" = Linux ] || refuser "hote Linux requis"
[ "$(stat -fc %T /sys/fs/cgroup)" = cgroup2fs ] || refuser "cgroup v2 requis"
[ -S /var/run/docker.sock ] || refuser "socket Docker local absent"
docker info --format '{{json .SecurityOptions}}' | grep -q 'name=seccomp' ||
  refuser "seccomp Docker inactif"
/usr/bin/node --version | grep -q '^v24\.' || refuser "Node 24 requis dans /usr/bin/node"
git -C "$racine" diff --quiet HEAD -- infra/documentaire workers scripts lib/coffre ||
  refuser "modifications locales non relues"

echo "Construction de l'image depuis $(git -C "$racine" rev-parse HEAD)"
install -d -m 0755 "$conf"
docker build --iidfile "$conf/image-id.tmp" -f "$racine/infra/documentaire/Dockerfile" "$racine"
image=$(cat "$conf/image-id.tmp")
rm -f "$conf/image-id.tmp"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || refuser "identifiant d'image invalide"

id cloison-documentaire >/dev/null 2>&1 ||
  useradd --system --user-group --home-dir /var/lib/cloison-documentaire \
    --shell /usr/sbin/nologin cloison-documentaire

# Code en lecture seule, possede par root ; rien d'autre du depot n'est copie.
rm -rf "$cible.nouveau"
install -d -m 0755 "$cible.nouveau"
for fichier in "${fichiers[@]}"; do
  install -D -m 0644 "$racine/$fichier" "$cible.nouveau/$fichier"
done
printf '{ "private": true, "type": "module" }\n' >"$cible.nouveau/package.json"
chmod 0644 "$cible.nouveau/package.json"
find "$cible.nouveau" -type d -exec chmod 0755 {} +
rm -rf "$cible.ancien"
[ -d "$cible" ] && mv "$cible" "$cible.ancien"
mv "$cible.nouveau" "$cible"

if [ ! -s "$conf/secret" ]; then
  openssl rand -hex 32 >"$conf/secret"
  chmod 0600 "$conf/secret"
  echo "Secret cree dans $conf/secret : le copier dans DOCUMENTAIRE_DISTANT_SECRET sur Vercel."
fi
printf 'DOCUMENTAIRE_IMAGE=%s\nDOCUMENTAIRE_ECOUTE=127.0.0.1:8787\n' "$image" >"$conf/service.env"
chmod 0644 "$conf/service.env"

install -m 0644 "$racine/infra/documentaire/hote/cloison-documentaire.service" \
  /etc/systemd/system/cloison-documentaire.service
systemctl daemon-reload
systemctl enable cloison-documentaire.service >/dev/null
systemctl restart cloison-documentaire.service

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8787/sante 2>/dev/null | grep -q '"pret"'; then
    echo "Service documentaire pret avec l'image $image"
    exit 0
  fi
  sleep 1
done
journalctl -u cloison-documentaire --no-pager -n 20 >&2
refuser "auto-test du conteneur non concluant"
