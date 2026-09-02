## Ce que fait cette PR

<!-- Une ou deux phrases. Le « pourquoi » avant le « comment ». -->

## Vérifications

- [ ] `npm run check` passe en local (types, lint, format, typographie, variables publiques)
- [ ] Rendu vérifié en mobile et en desktop
- [ ] Aucune couleur ni ombre écrite en dur : tout passe par les tokens de `app/globals.css`
- [ ] Le texte ajouté vit dans `lib/content/`, pas dans un composant
- [ ] Ni emoji, ni tiret cadratin : une icône se dessine dans `components/ui/Icone.tsx`
- [ ] Aucun secret derrière `NEXT_PUBLIC_` ni dans le bloc `env` de `next.config.ts`

## Si cette PR touche aux données ou aux accès

- [ ] La migration est versionnée dans `supabase/migrations/`, jamais modifiée après application
- [ ] RLS activée dès la création de la table, et refus par défaut
- [ ] La décision structurante est écrite dans `docs/adr/`, ou une ADR existante est citée

## Captures

<!-- Avant / après si le rendu change. -->
