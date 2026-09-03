-- Ce qui entre dans le coffre, et l'endroit exact ou ca se range.
--
-- Trois regles, toutes tenues par la base plutot que par le code applicatif,
-- pour la meme raison qu'ailleurs : elles ne doivent pas dependre du chemin
-- par lequel la piece est arrivee.
--
--   1. une piece porte le type reel de ses octets, pas celui annonce ;
--   2. elle se range dans le repertoire de son dossier, et nulle part ailleurs ;
--   3. un dossier ne se remplit pas indefiniment.
--
-- Sur l'antivirus, absent ici volontairement : voir `docs/dettes.md`.

-- ---------------------------------------------------------------------------
-- 1. Le type reel
-- ---------------------------------------------------------------------------
--
-- Deux colonnes qui se ressemblent et ne disent pas la meme chose. `type` est
-- la nature du document pour l'agence : un bulletin de paie, un avis
-- d'imposition. `type_reel` est ce que les octets sont vraiment.
--
-- Le second ne se deduit jamais de l'extension du fichier depose. Un `.pdf`
-- est une affirmation du client, et le client est ici une personne qu'on n'a
-- jamais vue.

alter table public.pieces
  add column type_reel text not null
      check (type_reel in ('application/pdf', 'image/jpeg', 'image/png'));

comment on column public.pieces.type_reel is
  'Le type lu dans les octets deposes, jamais celui annonce par le client.';

comment on column public.pieces.taille_octets is
  'La taille du document en clair. Le scelle range dans Storage fait 28 octets de plus.';

-- ---------------------------------------------------------------------------
-- 2. Une piece se range dans son dossier
-- ---------------------------------------------------------------------------
--
-- Le chemin est fabrique par le serveur, mais le serveur peut se tromper et
-- l'insertion se fait sous le role du porteur : la contrainte rend la faute
-- impossible plutot qu'improbable. Un chemin qui pointerait ailleurs devient
-- inecrivable, et la politique Storage plus bas dit la meme chose du cote des
-- octets.

alter table public.pieces
  add constraint chemin_dans_le_dossier
      check (chemin like dossier_id::text || '/%');

-- ---------------------------------------------------------------------------
-- 3. Un dossier ne se remplit pas indefiniment
-- ---------------------------------------------------------------------------
--
-- Sans plafond, un lien valide sept jours suffit a remplir Storage. Deux
-- bornes plutot qu'une, parce qu'elles ne retiennent pas la meme chose : le
-- nombre arrete les milliers de petits fichiers, le volume arrete les vingt
-- gros. Chacune a son message, pour que la personne sache lequel des deux
-- vient de la stopper.
--
-- Les chiffres viennent du dossier reel : trois bulletins, un avis
-- d'imposition, une piece d'identite recto verso, un justificatif de domicile,
-- un contrat de travail. Huit pieces. Vingt laisse de la marge sans laisser la
-- porte ouverte.

create function public.piece_refusee_au_dela_du_plafond()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nombre integer;
  volume bigint;
begin
  select count(*), coalesce(sum(taille_octets), 0)
    into nombre, volume
    from public.pieces
   where dossier_id = new.dossier_id;

  if nombre >= 20 then
    raise exception 'Ce dossier contient deja vingt pieces, le maximum.'
      using errcode = 'check_violation';
  end if;

  if volume + new.taille_octets > 60 * 1024 * 1024 then
    raise exception 'Ce dossier depasserait soixante megaoctets au total.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger piece_sous_plafond
  before insert on public.pieces
  for each row
  execute function public.piece_refusee_au_dela_du_plafond();

-- ---------------------------------------------------------------------------
-- 4. Le bucket, et qui y touche
-- ---------------------------------------------------------------------------
--
-- Prive : aucune URL ne rend un objet lisible sans jeton. Ce serait deja vrai
-- que le contenu est scelle, mais un bucket public serait une facon de dire
-- qu'on compte sur le chiffrement seul, et on ne compte jamais sur une seule
-- barriere.

insert into storage.buckets (id, name, public)
values ('pieces', 'pieces', false)
on conflict (id) do nothing;

-- `storage.objects` est la seule table du projet ou l'on n'ecrit pas
-- `revoke all` avant d'accorder. La raison est precise : les droits de table y
-- portent sur tous les buckets a la fois, y compris ceux qu'on ajoutera plus
-- tard, et Supabase s'en sert pour son propre fonctionnement. Leur retirer
-- quelque chose deborderait donc de ce qui nous regarde. La barriere y est la
-- RLS, active sans aucune politique, donc fermee par defaut : on ouvre par
-- politique, et une politique reste bornee a notre seau.
--
-- `porteur_lien`, lui, est notre role : il nait a la migration 0002, donc
-- apres tout ce que Supabase a distribue, et n'a rien recu. Sans ces trois
-- lignes il ne verrait meme pas le schema, et aucune politique ne serait
-- jamais evaluee.

grant usage on schema storage to porteur_lien;
grant select, insert, delete on storage.objects to porteur_lien;
grant select on storage.buckets to porteur_lien;

create policy "Le garant depose dans le dossier de son lien"
  on storage.objects for insert to porteur_lien
  with check (
    bucket_id = 'pieces'
    and public.partie_courante() = 'garant'
    and name like public.dossier_courant()::text || '/%'
  );

create policy "Le garant relit ce qu il a depose"
  on storage.objects for select to porteur_lien
  using (
    bucket_id = 'pieces'
    and public.partie_courante() = 'garant'
    and name like public.dossier_courant()::text || '/%'
  );

-- Le pendant exact de la politique de suppression des metadonnees : tant que
-- le dossier n'est pas parti, la piece se retire entierement, ligne et octets.
create policy "Le garant retire ses octets avant transmission"
  on storage.objects for delete to porteur_lien
  using (
    bucket_id = 'pieces'
    and public.partie_courante() = 'garant'
    and name like public.dossier_courant()::text || '/%'
    and exists (
      select 1 from public.dossiers d
       where d.id = public.dossier_courant()
         and d.statut in ('ouvert', 'depot_en_cours')
    )
  );

-- L'agence lit des octets scelles, donc inertes : c'est le meme raisonnement
-- que pour `cles_dossier`. Ce qui la protege n'est pas de lui cacher le
-- chiffre, c'est que la cle maitresse n'est pas chez Supabase.
create policy "Une agence lit les octets de ses dossiers"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pieces'
    and exists (
      select 1 from public.dossiers d
       where d.agence_id = public.agence_courante()
         and objects.name like d.id::text || '/%'
    )
  );

-- Le locataire n'a aucune politique ici, comme il n'en a aucune sur `pieces`
-- ni sur `cles_dossier`. C'est la cloison qui fait le produit : il suit
-- l'avancement de son dossier sans jamais voir ce que son garant a depose.
