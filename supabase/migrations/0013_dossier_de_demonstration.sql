-- Le dossier de demonstration : le produit entier, sur un faux dossier.
--
-- L'ADR 0002 en fait une brique et non un accessoire : « un compte non
-- verifie est un compte complet : produit entier sur un dossier de
-- demonstration, tout sauf l'envoi d'un lien reel ». Sans lui, l'inscription
-- ouverte est un decor, et c'est exactement ce que la 0012 vient de rendre
-- visible : une agence en decouverte voit un espace vide et un bouton grise.
--
-- Ce que la base garantit ici tient en deux points.
--
-- 1. Un dossier de demonstration est marque comme tel, et il le reste : la
--    colonne n'est accordee en ecriture a personne. On ne transforme pas une
--    demonstration en dossier reel, ni l'inverse.
--
-- 2. Il s'ouvre sans verification, et c'est le seul dossier qui s'ouvre
--    ainsi. Aucun lien n'en sort jamais : les adresses sont des adresses de
--    demonstration, et le serveur ne leur ecrit pas.
--
-- Le contenu du dossier (pieces, engagement, loyer) est pose par le serveur,
-- avec les jetons qu'il s'emet a lui-meme : les memes chemins que pour un vrai
-- garant et un vrai locataire, donc les memes politiques, le meme chiffrement,
-- le meme journal. Une demonstration qui passerait par d'autres chemins ne
-- demontrerait rien.

alter table public.dossiers
  add column demonstration boolean not null default false;

comment on column public.dossiers.demonstration is
  'Vrai pour le dossier de demonstration d une agence. Jamais un vrai locataire, jamais un lien envoye.';

create index dossiers_demonstration_idx on public.dossiers (agence_id) where demonstration;

create function public.ouvrir_dossier_de_demonstration()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l_agence uuid;
  existant uuid;
  nouveau  uuid;
begin
  l_agence := public.agence_courante();

  if l_agence is null then
    raise exception 'Reserve aux membres d''une agence.' using errcode = '42501';
  end if;

  -- Un seul par agence, tant qu'il vit. Rappeler la fonction rend celui qui
  -- existe : un double clic n'en cree pas deux.
  select d.id into existant
    from public.dossiers d
   where d.agence_id = l_agence
     and d.demonstration
     and d.statut not in ('expire', 'refuse')
   order by d.cree_le desc
   limit 1;

  if found then
    return existant;
  end if;

  -- Directement dans la table, et non par `ouvrir_dossier` : celle-ci refuse
  -- aux agences non verifiees, et c'est precisement pour elles que ce dossier
  -- existe. Les adresses ne recevront jamais rien.
  insert into public.dossiers (agence_id, email_locataire, email_garant, demonstration)
  values (l_agence, 'locataire.demo@cloison.fr', 'garant.demo@cloison.fr', true)
  returning id into nouveau;

  return nouveau;
end;
$$;

comment on function public.ouvrir_dossier_de_demonstration() is
  'Ouvre, ou retrouve, le dossier de demonstration de l agence de l appelant. Sans verification, sans lien.';

revoke all on function public.ouvrir_dossier_de_demonstration() from public;
grant execute on function public.ouvrir_dossier_de_demonstration() to authenticated;
