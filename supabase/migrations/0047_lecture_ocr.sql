-- Reservation explicite et bornee avant tout envoi OCR externe.
alter table public.journal_acces drop constraint journal_acces_action_check;
alter table public.journal_acces add constraint journal_acces_action_check check(action in
 ('dossier_consulte','piece_deposee','piece_retiree','piece_ouverte','dossier_transmis',
 'complement_demande','complement_fourni','complement_valide','complement_refuse','ocr_demande'));

create function public.reserver_lecture_ocr(la_piece uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 dossier uuid; agence uuid; sujet text; limite integer; atteint integer;
 v_fenetre timestamptz := date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch');
begin
 select d.id,d.agence_id into dossier,agence from public.pieces p
 join public.dossiers d on d.id=p.dossier_id
 where p.id=la_piece and d.agence_id=public.agence_courante()
 and d.expire_le>clock_timestamp() and d.statut<>'expire';
 if dossier is null or auth.uid() is null then return false; end if;
 perform pg_advisory_xact_lock(7047001);
 delete from public.debits where cle like 'ocr:%' and debits.fenetre<v_fenetre;
 for sujet,limite in select * from (values
 ('ocr:acteur:'||auth.uid()::text,5),('ocr:agence:'||agence::text,30),('ocr:global:partage',100)) x(s,l)
 loop
   insert into public.debits(cle,fenetre,compte) values(sujet,v_fenetre,1)
   on conflict(cle,fenetre) do update set compte=public.debits.compte+1 returning compte into atteint;
   if atteint>limite then return false; end if;
 end loop;
 insert into public.journal_acces(dossier_id,acteur,acteur_id,action,piece_id)
 values(dossier,'agence',auth.uid(),'ocr_demande',la_piece);
 return true;
end;
$$;
revoke all on function public.reserver_lecture_ocr(uuid) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.reserver_lecture_ocr(uuid) to authenticated;

