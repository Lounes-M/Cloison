FROM scratch AS contexte
COPY . /

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS dependances
WORKDIR /moteur
COPY infra/documentaire/package.json infra/documentaire/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
WORKDIR /moteur
COPY --from=dependances /moteur/node_modules ./node_modules
COPY workers/document.mjs workers/dimensions.ts workers/validation-document.ts workers/rasterisation.ts ./workers/
COPY infra/documentaire/entree.mjs ./entree.mjs
ENV NODE_ENV=production LANG=C.UTF-8 TZ=UTC DISABLE_SYSTEM_FONTS_LOAD=1
USER 65532:65532
ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "15s", "/usr/local/bin/node", "--max-old-space-size=128", "entree.mjs"]
