# Procédure en cas de violation de données

Tâche 41. Elle s'écrit à froid, parce que le jour où elle sert, on n'a plus le temps de la
rédiger. Elle suppose une seule personne aux commandes, ce qui est le cas pendant le pilote.

## Ce qui compte comme une violation

Tout accès, divulgation, altération ou perte de données personnelles non autorisé. Pour Cloison,
les cas à avoir en tête :

- une pièce d'un garant vue par quelqu'un qui n'en avait pas le droit, y compris le locataire ;
- un lien d'accès arrivé dans de mauvaises mains et utilisé ;
- la clé maîtresse exposée (dépôt, journaux, variable d'environnement copiée) ;
- un compte d'agence compromis ;
- une perte de données non restaurable.

## Les 72 heures

L'horloge de la notification à la CNIL démarre à la **connaissance** de la violation, pas à sa
résolution.

**Heure 0 : contenir.**

| Cas                       | Geste immédiat                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lien compromis            | réémettre le jeton de la partie concernée : `select public.emettre_jeton('<dossier>', 'garant', '7 days')` révoque l'ancien                                                                                                            |
| compte d'agence compromis | dans Supabase, Authentication : révoquer les sessions de l'utilisateur, puis `update public.agences set statut = 'suspendue'` si l'agence entière est en cause                                                                         |
| clé maîtresse exposée     | générer une nouvelle clé et la poser dans Vercel : **les pièces existantes deviennent illisibles**, c'est voulu ; les dossiers en cours devront être redéposés. La rotation avec re-chiffrement n'existe pas (ADR 0003, laissé ouvert) |
| accès anormal massif      | suspendre l'agence concernée ; au besoin, retirer temporairement les politiques de lecture de `pieces` et `storage.objects` pour `authenticated`                                                                                       |
| perte de données          | voir `docs/exploitation/sauvegardes-et-restauration.md`                                                                                                                                                                                |

**Heures 0 à 24 : comprendre.** Le journal des accès est fait pour ça : il est en écriture seule,
et personne n'a pu y écrire au nom d'un autre.

```sql
select j.dossier_id, j.action, j.acteur, j.acteur_id, j.quand, u.email
  from public.journal_acces j
  left join auth.users u on u.id = j.acteur_id
 where j.quand > now() - interval '7 days'
 order by j.quand desc;
```

Consigner, dans un fichier daté, hors dépôt : ce qui s'est passé, depuis quand, quelles données,
combien de personnes, ce qui a été fait. Ce fichier est la base de tout ce qui suit.

**Avant 72 heures : notifier la CNIL** si la violation présente un risque pour les personnes.
Pour des bulletins de paie, des avis d'imposition et des pièces d'identité, la réponse est presque
toujours oui. Formulaire en ligne de la CNIL. Si tout n'est pas encore connu, notifier ce qui
l'est et compléter ensuite : la notification en plusieurs temps est prévue.

**Sans délai : informer les personnes** si le risque est élevé pour elles. C'est le cas dès qu'une
pièce d'identité ou un justificatif de revenus a pu être vu. Le message dit : ce qui s'est passé,
ce que ça peut entraîner pour elles, ce qu'on a fait, ce qu'elles peuvent faire, comment nous
joindre. Sans jargon, sans minimiser.

**Informer l'agence** rattachée au dossier, qui est responsable de traitement pour sa part.

## Après

- Registre des violations : une ligne par événement, même sans notification. Obligatoire.
- Une revue : qu'est-ce qui a permis la violation, qu'est-ce qui l'aurait empêchée, et l'inscrire
  dans `docs/dettes.md` avec un signal de sortie, comme le reste.

## Ce qui manque pour que cette procédure tienne

- L'adresse de contact `rgpd@…` et le canal pour joindre les personnes : aujourd'hui, seule
  l'adresse e-mail du dossier existe, et elle meurt avec lui.
- L'alerting de la tâche 40 : sans lui, la « connaissance » de la violation risque d'arriver par
  la personne concernée, ce qui est le pire des scénarios.
- La rotation de la clé maîtresse avec re-chiffrement, pour que « clé exposée » ne signifie pas
  « dossiers en cours perdus ».
