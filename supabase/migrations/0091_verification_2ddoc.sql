-- Verification du code 2D-Doc d'un avis d'imposition, a la demande de l'agence.
--
-- Le 2D-Doc est le code-barres signe que l'administration imprime sur l'avis.
-- Nos serveurs le lisent et en verifient la signature ; l'agence apprend
-- « authentique » ou « non verifiable », jamais autre chose, et decide seule.
--
-- Comme pour la transcription (0047), la reservation precede toute lecture du
-- coffre : elle verifie l'agence, l'etat du dossier et la nature de la piece,
-- consomme un quota et inscrit la tentative au journal. Seul l'avis
-- d'imposition est accepte : la piece d'identite et les autres natures sont
-- refusees ici, avant tout dechiffrement. Le resultat n'est pas enregistre.

alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse','ocr_demande',
 'relances_reprises','loyer_corrige','dossier_refuse','lecture_ia_garant','code_2ddoc_verifie'));

create function public.reserver_verification_2ddoc(la_piece uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 dossier uuid; agence uuid; sujet text; limite integer; atteint integer;
 v_fenetre timestamptz := date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch');
begin
 select d.id,d.agence_id into dossier,agence from public.pieces p
 join public.dossiers d on d.id=p.dossier_id
 where p.id=la_piece and d.agence_id=public.agence_courante()
 and p.type='avis_imposition'
 -- Avant un premier dossier complet, l'agence ne lit aucune piece (0087).
 and (d.complet_le is not null or d.demonstration)
 and d.expire_le>clock_timestamp() and d.statut<>'expire';
 if dossier is null or auth.uid() is null then return false; end if;
 -- Compteurs propres : cette verification n'appelle aucun fournisseur d'IA et
 -- ne doit ni consommer ni subir le budget de la transcription.
 perform pg_advisory_xact_lock(7089001);
 delete from public.debits where cle like '2ddoc:%' and debits.fenetre<v_fenetre;
 for sujet,limite in select * from (values
 ('2ddoc:acteur:'||auth.uid()::text,10),('2ddoc:agence:'||agence::text,60),('2ddoc:global:partage',200)) x(s,l)
 loop
   insert into public.debits(cle,fenetre,compte) values(sujet,v_fenetre,1)
   on conflict(cle,fenetre) do update set compte=public.debits.compte+1 returning compte into atteint;
   if atteint>limite then return false; end if;
 end loop;
 insert into public.journal_acces(dossier_id,acteur,acteur_id,action,piece_id)
 values(dossier,'agence',auth.uid(),'code_2ddoc_verifie',la_piece);
 return true;
end;
$$;
revoke all on function public.reserver_verification_2ddoc(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.reserver_verification_2ddoc(uuid) to authenticated;
