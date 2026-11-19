#!/usr/bin/env bash
# Installe les trois moteurs Playwright et leurs dependances systeme.
# D'ordinaire moins d'une minute ; un miroir de paquets bloque a deja consomme
# tout le delai d'un job. Trois essais de quatre minutes au plus, puis echec franc.
set -u
for essai in 1 2 3; do
  timeout 240 npx playwright install --with-deps chromium firefox webkit && exit 0
  echo "Installation des navigateurs interrompue (essai $essai)"
  # Le delai coupe npx, pas l'apt-get lance en root : il garde le verrou dpkg
  # et ferait echouer l'essai suivant d'emblee. On le laisse finir, trois minutes au plus.
  for _ in $(seq 36); do
    pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || break
    sleep 5
  done
done
exit 1
