-- La demande d'activation : le moment ou la barriere de l'ADR 0002 se leve.
--
-- Une agence en decouverte a le produit entier sur sa demonstration. Quand
-- elle veut ouvrir de vrais dossiers, elle declare son SIREN et sa carte
-- professionnelle, ce que la 0002 accorde deja a son administrateur, et elle
-- le dit. Cette migration ajoute seulement le « elle le dit » : la date de la
-- demande, pour qu'on sache qu'elle attend, et depuis quand.
--
-- Rien ici ne verifie. Pendant le pilote, la verification est manuelle,
-- depuis le tableau de bord Supabase : l'ADR 0002 l'a decide, et la 0002 l'a
-- rendu obligatoire en n'accordant `statut` a personne via l'API. Ce que cette
-- colonne apporte, c'est une file d'attente lisible, et un courriel qui part
-- avec ce que l'agence a essaye sur sa demonstration : un prospect qualifie,
-- pas un formulaire de contact.

alter table public.agences
  add column activation_demandee_le timestamptz null;

comment on column public.agences.activation_demandee_le is
  'Quand l administrateur a demande la verification. Nul tant qu il ne l a pas fait. La verification elle-meme reste manuelle.';

-- Le meme droit de colonne que `siren` et `carte_pro`, sous la meme politique :
-- un administrateur, sur son agence, tant qu'elle n'est pas suspendue.
grant update (activation_demandee_le) on public.agences to authenticated;

-- Les demandes en attente, dans l'ordre : ce que tu regarderas.
create index agences_activation_idx on public.agences (activation_demandee_le)
  where activation_demandee_le is not null and statut = 'decouverte';
