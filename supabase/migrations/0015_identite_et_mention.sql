-- L'identite du garant, et sa mention.
--
-- L'acte de cautionnement est pre-rempli sauf la mention (ADR 0005). Pour le
-- pre-remplir, il manque ce que personne n'a saisi : le depot ne connait que
-- des adresses e-mail. Le garant donne ici son nom, son prenom et son adresse ;
-- le locataire, son nom.
--
-- Et la mention. L'article 2297 du Code civil exige que la caution l'appose
-- ELLE-MEME, a peine de nullite : ce n'est donc pas une colonne que le serveur
-- remplit, c'est une colonne que seul `porteur_lien`, en tant que garant,
-- ecrit. Le serveur verifie ce qu'elle contient ; il ne le fournit jamais. La
-- date de saisie l'accompagne toujours : une mention sans date, ou une date
-- sans mention, n'existe pas.

alter table public.engagements
  add column nom      text null check (nom is null or char_length(btrim(nom)) between 1 and 120),
  add column prenom   text null check (prenom is null or char_length(btrim(prenom)) between 1 and 120),
  add column adresse  text null check (adresse is null or char_length(btrim(adresse)) between 5 and 400),
  add column mention  text null check (mention is null or char_length(btrim(mention)) between 40 and 2000),
  add column mention_saisie_le timestamptz null,
  add constraint mention_et_sa_date check ((mention is null) = (mention_saisie_le is null));

comment on column public.engagements.mention is
  'La mention de l article 2297, apposee par le garant lui-meme. Jamais pre-remplie.';

alter table public.dossiers
  add column locataire_nom text null
      check (locataire_nom is null or char_length(btrim(locataire_nom)) between 1 and 120);

-- Le garant ecrit son identite et sa mention ; le locataire, son nom. Les
-- politiques de la 0003 decident des lignes et des roles, comme pour le reste.
grant update (nom, prenom, adresse, mention, mention_saisie_le) on public.engagements to porteur_lien;
grant update (locataire_nom) on public.dossiers to porteur_lien;
