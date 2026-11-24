-- Durcissements issus de la revue de securite de novembre 2026.
--
-- Cinq corrections independantes, chacune eprouvee dans
-- `tests/durcissements-securite-sql.test.ts`.
--
-- 1. Le loyer pose par la colocation echappait a trois declencheurs.
--    En bail solidaire, `verifier_colocation_du_dossier` (0092) ecrit le loyer
--    total dans `new.loyer_cents`, depuis un declencheur BEFORE. Or les trois
--    declencheurs qui suivent un changement de loyer etaient declares
--    `after update of loyer_cents` : Postgres ne les reveille que si la colonne
--    figure dans le SET de la requete, jamais quand un declencheur BEFORE la
--    modifie. Une agence qui rattachait un dossier a une colocation solidaire
--    par `update dossiers set colocation_id = ...` changeait donc un loyer
--    fige par la declaration du garant :
--      - sans ligne `loyer_corrige` au journal que le garant consulte (0084) ;
--      - sans recopie vers le dossier du second garant (0067), dont le loyer
--        et le ratio restaient ceux d'avant ;
--      - sans le recalcul propre au loyer (0011).
--    Les trois declencheurs se reveillent desormais sur la valeur, pas sur la
--    liste des colonnes ecrites.
--
-- 2. Le garant commun pose a l'entree, apres la mention.
--    La 0094 interdit de changer le nombre de colocataires couverts une fois
--    la mention du garant saisie, mais seulement pour un dossier deja dans la
--    colocation. Un dossier qui y entrait pouvait arriver avec trois
--    colocataires couverts alors que son garant avait deja recopie sa mention
--    pour un seul.
--
-- 3. Les relances du locataire, plafonnees par destinataire.
--    Hors agence, n'importe qui ouvre un dossier au nom d'une adresse ; chaque
--    dossier non regle vaut ensuite jusqu'a trois relances (0089). Le plafond
--    etait par dossier : dix dossiers ouverts pour la meme adresse, trente
--    courriels, et le plafond commun des dossiers sans agence epuise pour les
--    autres. Une adresse ne recoit plus qu'une relance de locataire par
--    periode de trois jours pour l'ensemble de ses dossiers sans agence.
--
-- 4. `demandes_agence` gardait les droits par defaut de Supabase.
--    C'etait la seule table applicative ou `anon` et `authenticated` avaient
--    encore SELECT, UPDATE, DELETE et TRUNCATE : seule la RLS, sans politique
--    de lecture, les arretait, et TRUNCATE ne passe pas par la RLS. Depuis la
--    0023, seul le role `serveur` y ecrit. La politique d'insertion laissee a
--    `anon` par la 0001 n'avait plus de droit pour la porter.
--
-- 5. Aucun caractere de controle dans ce qui part vers l'exploitant.
--    Le nom d'une agence, sa carte professionnelle, et le nom et la ville
--    d'une demande de demonstration sont recopies dans des courriels internes
--    qui portent une ligne SQL a coller dans l'editeur Supabase. Un saut de
--    ligne dans ces champs permettait d'y ecrire de fausses consignes. Les
--    contraintes sont posees `not valid` : elles s'appliquent a toute ecriture
--    a venir sans relire les lignes en place.

-- ---------------------------------------------------------------------------
-- 1. Le loyer, suivi sur sa valeur
-- ---------------------------------------------------------------------------

-- Le recalcul ecrit `statut`, jamais `loyer_cents` : la condition garde ce
-- declencheur endormi sur ses propres ecritures, comme le faisait `of`.
drop trigger loyer_recalcule_le_dossier on public.dossiers;
create trigger loyer_recalcule_le_dossier
after update on public.dossiers
for each row when (old.loyer_cents is distinct from new.loyer_cents)
execute function public.declenche_recalcul_loyer();

drop trigger loyer_recopie_au_second on public.dossiers;
create trigger loyer_recopie_au_second
after update on public.dossiers
for each row when (old.loyer_cents is distinct from new.loyer_cents)
execute function public.recopier_loyer_au_second();

drop trigger decision_agence_tracee on public.dossiers;
create trigger decision_agence_tracee
after update on public.dossiers
for each row when (old.statut is distinct from new.statut
                or old.loyer_cents is distinct from new.loyer_cents)
execute function public.tracer_decision_agence();

-- ---------------------------------------------------------------------------
-- 2. Le garant commun a l'entree dans la colocation
-- ---------------------------------------------------------------------------

-- Un declencheur a part, pour ne pas reecrire `verifier_colocation_du_dossier`.
-- A l'insertion, aucun engagement n'existe encore : seule la mise a jour
-- compte.
create function public.refuser_garant_commun_apres_mention() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.colocation_id is not null
     and new.colocataires_garantis <> 1
     and (old.colocation_id is distinct from new.colocation_id
          or old.colocataires_garantis is distinct from new.colocataires_garantis)
     and exists(select 1 from public.engagements e
                 where e.dossier_id = new.id and e.mention is not null) then
    raise exception 'Le garant commun ne se modifie plus sur ce dossier.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.refuser_garant_commun_apres_mention()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger garant_commun_apres_mention
before update of colocation_id, colocataires_garantis on public.dossiers
for each row execute function public.refuser_garant_commun_apres_mention();

-- ---------------------------------------------------------------------------
-- 3. Une relance de locataire par adresse et par periode de trois jours
-- ---------------------------------------------------------------------------

-- `programmer_rappels` garde son corps : le rappel en trop n'est simplement
-- pas inscrit, et se represente au passage suivant. Les lignes deja inscrites
-- par la meme requete sont visibles ici, si bien que deux dossiers de la meme
-- adresse ne passent pas ensemble.
create function public.plafonner_relances_locataire() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.nature = 'locataire' and new.agence_id is null and exists(
       select 1 from public.rappels_dossiers r
        where r.nature = 'locataire' and r.agence_id is null
          and r.empreinte_email = new.empreinte_email
          and r.dossier_id <> new.dossier_id
          and r.cree_le > clock_timestamp() - interval '3 days') then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.plafonner_relances_locataire()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger relances_locataire_plafonnees
before insert on public.rappels_dossiers
for each row execute function public.plafonner_relances_locataire();
create index rappels_locataire_destinataire
  on public.rappels_dossiers(empreinte_email, cree_le)
  where nature = 'locataire' and agence_id is null;

-- ---------------------------------------------------------------------------
-- 4. Les demandes d'agence : plus aucun droit par defaut
-- ---------------------------------------------------------------------------

drop policy if exists "Une agence peut deposer une demande" on public.demandes_agence;
revoke all on public.demandes_agence
 from public,anon,authenticated,porteur_lien,depot_piece,archive_signature;

-- ---------------------------------------------------------------------------
-- 5. Une ligne, et rien qui se fasse passer pour une autre
-- ---------------------------------------------------------------------------

-- Caracteres de controle, separateurs de ligne Unicode et marques
-- d'inversion du sens d'ecriture.
alter table public.agences
  add constraint agences_nom_sur_une_ligne
    check (nom !~ '[[:cntrl:]\u2028\u2029\u202A-\u202E\u2066-\u2069]') not valid,
  add constraint agences_carte_pro_sur_une_ligne
    check (carte_pro is null
           or carte_pro !~ '[[:cntrl:]\u2028\u2029\u202A-\u202E\u2066-\u2069]') not valid;
alter table public.demandes_agence
  add constraint demandes_agence_nom_sur_une_ligne
    check (nom_agence !~ '[[:cntrl:]\u2028\u2029\u202A-\u202E\u2066-\u2069]') not valid,
  add constraint demandes_agence_email_sur_une_ligne
    check (email !~ '[[:cntrl:]\u2028\u2029\u202A-\u202E\u2066-\u2069]') not valid,
  add constraint demandes_agence_ville_sur_une_ligne
    check (ville !~ '[[:cntrl:]\u2028\u2029\u202A-\u202E\u2066-\u2069]') not valid;

notify pgrst,'reload schema';
