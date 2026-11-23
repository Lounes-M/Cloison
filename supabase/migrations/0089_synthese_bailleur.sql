-- Synthese du dossier pour le bailleur.
--
-- L'agence telecharge une page qu'elle remet au proprietaire : le ratio face
-- au seuil, les pieces examinees, l'etat de l'acte. Aucun justificatif n'y
-- figure, et aucun montant de revenu : la fonction ne lit pas la colonne
-- `revenu_net_mensuel_cents`, si bien que le code qui dessine la page ne peut
-- pas l'imprimer, meme par erreur.
--
-- La trace et la lecture sont le meme geste (ADR 0004) : la ligne du journal
-- est inscrite dans la transaction qui rend les donnees. Pas de synthese sans
-- trace, pas de trace sans droit sur le dossier.
--
-- Preconditions : dossier de l'agence courante (compte verifie, MFA), non
-- echu, complet au moins une fois ou de demonstration, dans un statut ou une
-- decision se prend ou s'est prise. Dix syntheses par personne, par dossier et
-- par heure : chacune coute une rasterisation.

alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse','ocr_demande',
 'relances_reprises','loyer_corrige','dossier_refuse','lecture_ia_garant','synthese_bailleur'));

create function public.preparer_synthese_bailleur(le_dossier uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 d public.dossiers;
 qui uuid := auth.uid();
begin
 if le_dossier is null or qui is null or public.agence_courante() is null then return null; end if;
 select * into d from public.dossiers x
  where x.id=le_dossier and x.agence_id=public.agence_courante()
  and x.expire_le>clock_timestamp()
  and (x.complet_le is not null or x.demonstration)
  and x.statut in ('complet','garant_insuffisant','transmis','signe');
 if not found then return null; end if;

 -- Le verrou serialise le comptage : deux demandes simultanees ne passent pas
 -- toutes les deux sous le plafond.
 perform pg_advisory_xact_lock(7089001, hashtext(qui::text || d.id::text));
 if (select count(*) from public.journal_acces j
     where j.dossier_id=d.id and j.action='synthese_bailleur' and j.acteur_id=qui
     and j.quand>clock_timestamp()-interval '1 hour')>=10 then
   return null;
 end if;

 insert into public.journal_acces(dossier_id,acteur,acteur_id,action)
 values(d.id,'agence',qui,'synthese_bailleur');

 return jsonb_build_object(
  'reference',d.reference,
  'statut',d.statut,
  'demonstration',d.demonstration,
  'locataire',d.locataire_nom,
  'loyer_cents',d.loyer_cents,
  'logement',(select l.libelle from public.logements l where l.id=d.logement_id and l.agence_id=d.agence_id),
  'agence',(select a.nom from public.agences a where a.id=d.agence_id),
  'seuil',(select a.seuil_ratio from public.agences a where a.id=d.agence_id),
  'engagement',(select jsonb_build_object(
    'garant',nullif(btrim(concat_ws(' ',e.prenom,e.nom)),''),
    'couvre',e.couvre,
    'plafond_cents',e.montant_max_cents,
    'jusqu_au',e.jusqu_au,
    'solidaire',e.solidaire,
    'mention_le',e.mention_saisie_le,
    'ratio',e.ratio,
    'calcule_le',e.calcule_le)
   from public.engagements e where e.dossier_id=d.id),
  'groupe',(select jsonb_build_object('reference',g.autre_reference,'ratio',g.ratio_groupe)
   from public.groupe_du_dossier(d.id) g limit 1),
  'pieces',coalesce((select jsonb_agg(jsonb_build_object(
    'type',p.type,
    'documents',p.nombre_documents,
    'depose_le',p.depose_le,
    'examen',x.etat,
    'examine_le',x.cree_le) order by p.depose_le,p.id)
   from public.pieces p
   left join lateral (select e.etat,e.cree_le from public.examens_documentaires e
    where e.piece_id=p.id and e.dossier_id=d.id order by e.id desc limit 1) x on true
   where p.dossier_id=d.id
   and not exists(select 1 from public.complements_documentaires c
    where c.dossier_id=d.id and p.id=any(c.pieces_ecartees))),'[]'::jsonb),
  -- Un acte d'essai ne dit rien au bailleur : seule la production compte.
  -- L'acte archive l'emporte ; sinon le plus recent qui n'a pas ete refuse.
  'acte',(select a.etape from public.actes_signature a
   join public.demandes_signature s on s.id=a.id
   where s.source_dossier=d.id and a.agence_id=d.agence_id and s.environnement='production'
   and a.etape<>'refuse'
   order by (a.etape='archive') desc,s.cree_le desc limit 1));
end;
$$;
comment on function public.preparer_synthese_bailleur(uuid) is
 'Inscrit la synthese au journal et rend ce qu elle imprime. Jamais le revenu du garant.';
revoke all on function public.preparer_synthese_bailleur(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.preparer_synthese_bailleur(uuid) to authenticated;
