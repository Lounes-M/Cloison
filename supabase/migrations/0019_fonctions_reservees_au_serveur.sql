-- Ce que `anon` pouvait appeler sans passer par nous, il ne le peut plus.
--
-- La cle publiable est publique par construction. Tout ce qu'une migration
-- accorde a `anon` est donc appelable par n'importe qui, directement sur l'API
-- PostgREST du projet, sans passer par nos routes, nos validations ni notre
-- compteur de debit. Quatre fonctions etaient dans ce cas, et la dette le
-- disait (docs/dettes.md, « La limite de debit ne couvre que nos routes »).
--
-- Ce que cela permettait, et pas plus : remplir `dossiers` de lignes vides
-- avec `ouvrir_dossier` ou `ouvrir_dossier_avec_lien` ; reemettre, donc
-- revoquer, le jeton d'un dossier dont on connaitrait l'uuid, avec
-- `emettre_jeton` ; gonfler `debits` de cles inventees avec `consommer_debit`.
-- Aucune lecture, aucune escalade : la RLS tenait. Mais une porte qu'on ne
-- surveille pas finit par servir.
--
-- La parade retenue n'est pas de faire compter la fonction elle-meme, comme
-- la dette le supposait : c'est de reprendre la barriere qui tient partout
-- ailleurs dans ce depot, le role (ADR 0002). Le role `serveur`, ne avec la
-- 0018 pour le webhook de paiement, n'existe que par un jeton que nous
-- signons avec le secret du projet, cinq minutes, pour un appel. Qui n'a pas
-- ce secret ne peut pas le porter, donc ne peut plus appeler ces fonctions.
-- L'appel direct devient impossible plutot que borne.
--
-- Ce qui ne change pas : `authenticated` garde `ouvrir_dossier` et
-- `ouvrir_dossier_avec_lien`, parce que c'est le client de l'agence qui les
-- appelle, et que c'est son jeton qui rattache le dossier a l'agence via
-- `agence_courante()`. Il perd `emettre_jeton` et `jeton_est_actif`, que
-- notre code n'appelle jamais avec lui, et `consommer_debit`, idem pour
-- `porteur_lien`. Les fonctions appelees de l'interieur d'une autre fonction
-- `security definer` n'ont besoin d'aucun droit d'appelant : rien ne casse.
--
-- Cote code : `lib/acces/session.ts` et `lib/acces/debit.ts` portent
-- desormais le client du serveur la ou ils portaient le client anonyme.

-- ---------------------------------------------------------------------------
-- Ouvrir un dossier : le locataire passe par notre serveur, l'agence par
-- son propre client.
-- ---------------------------------------------------------------------------

revoke execute on function public.ouvrir_dossier(text) from anon;
grant  execute on function public.ouvrir_dossier(text) to serveur;

revoke execute on function public.ouvrir_dossier_avec_lien(text, interval) from anon;
grant  execute on function public.ouvrir_dossier_avec_lien(text, interval) to serveur;

-- ---------------------------------------------------------------------------
-- Emettre et verifier un jeton : notre serveur seul. Le locataire n'a pas
-- encore de jeton quand il en demande un, et le garant non plus quand il
-- suit le lien recu ; c'est precisement pour cela que ces deux fonctions
-- etaient ouvertes a `anon`, et c'est precisement ce que `serveur` remplace.
-- ---------------------------------------------------------------------------

revoke execute on function public.emettre_jeton(uuid, text, interval) from anon, authenticated;
grant  execute on function public.emettre_jeton(uuid, text, interval) to serveur;

revoke execute on function public.jeton_est_actif(uuid, text, uuid) from anon, authenticated;
grant  execute on function public.jeton_est_actif(uuid, text, uuid) to serveur;

-- ---------------------------------------------------------------------------
-- Compter le debit : notre serveur seul. L'empreinte qu'il envoie est deja
-- calculee avec la cle maitresse ; que l'appel lui-meme exige notre signature
-- ferme la table a qui voudrait la remplir de cles inventees.
-- ---------------------------------------------------------------------------

revoke execute on function public.consommer_debit(text, text) from anon, authenticated, porteur_lien;
grant  execute on function public.consommer_debit(text, text) to serveur;

comment on function public.consommer_debit(text, text) is
  'Consomme une unite et dit si elle passe. L appelant ne choisit pas son plafond. Reservee au role serveur.';
