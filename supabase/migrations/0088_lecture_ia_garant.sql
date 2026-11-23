-- Lecture IA des justificatifs de revenus, a la demande du garant lui-meme.
--
-- Le garant peut demander qu'une IA lise ses bulletins de paie ou son
-- attestation de pension pour lui proposer un revenu net mensuel. La
-- proposition n'ecrit rien : il la reporte dans le champ et enregistre
-- lui-meme, comme une saisie. Le ratio reste calcule sur ce qu'il declare.
--
-- La reservation precede toute lecture du coffre, comme pour l'agence (0047) :
-- elle verifie la partie, la nature de la piece et l'etat du dossier, consomme
-- un quota partage et inscrit la tentative au journal, sans aucun texte lu.
-- La piece d'identite, le justificatif de domicile et les autres natures ne
-- sont jamais acceptes : seules deux natures de revenus peuvent partir.

alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse','ocr_demande',
 'relances_reprises','loyer_corrige','dossier_refuse','lecture_ia_garant'));

create function public.reserver_lecture_ia_garant(la_piece uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 dossier uuid; sujet text; limite integer; atteint integer;
 v_fenetre timestamptz := date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch');
begin
 if public.dossier_courant() is null or public.partie_courante() is distinct from 'garant' then
   return false;
 end if;
 select d.id into dossier from public.pieces p
 join public.dossiers d on d.id=p.dossier_id
 where p.id=la_piece and d.id=public.dossier_courant()
 and p.type in ('bulletin_paie','pension_retraite')
 and d.statut in ('ouvert','depot_en_cours','complet','garant_insuffisant')
 and d.expire_le>clock_timestamp();
 if dossier is null then return false; end if;
 -- Meme verrou et meme compteur global que l'agence : un seul budget partage.
 perform pg_advisory_xact_lock(7047001);
 delete from public.debits where cle like 'ocr:%' and debits.fenetre<v_fenetre;
 for sujet,limite in select * from (values
 ('ocr:garant:'||dossier::text,8),('ocr:global:partage',100)) x(s,l)
 loop
   insert into public.debits(cle,fenetre,compte) values(sujet,v_fenetre,1)
   on conflict(cle,fenetre) do update set compte=public.debits.compte+1 returning compte into atteint;
   if atteint>limite then return false; end if;
 end loop;
 insert into public.journal_acces(dossier_id,acteur,acteur_id,action,piece_id)
 values(dossier,'garant',null,'lecture_ia_garant',la_piece);
 return true;
end;
$$;
revoke all on function public.reserver_lecture_ia_garant(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.reserver_lecture_ia_garant(uuid) to porteur_lien;
