#!/usr/bin/env bash
# Installe les trois moteurs Playwright et leurs dependances systeme.
# D'ordinaire moins d'une minute ; un miroir de paquets bloque a deja consomme
# tout le delai d'un job. Trois essais de quatre minutes au plus, puis echec franc.
set -u
for essai in 1 2 3; do
  timeout 240 npx playwright install --with-deps chromium firefox webkit && exit 0
  echo "Installation des navigateurs interrompue (essai $essai)"
  sleep 5
done
exit 1
