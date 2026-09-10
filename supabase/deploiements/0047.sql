begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"679e120c3a8474b7093e3f84ef1421c9f6c00afbb25b0b4b7124e98ef1f45a08","indexes":"ab4ce0d9439ec702d1656ca0bd347ea1b81a0411f9c861a92c72c548a32870d2","colonnes":"40a55e9b7413cd8ae4d3d7bdd34a2e6e80d659d224c8dfa4db5c12d3890a2175","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"1efadd14d1e7e48471d345193eed560abfdf9a2eec2de18a13eaaaddb9babb86","politiques":"7021234319bdc7b6269ab2b220a8d50f636651938b05f46ba6a41a425fa00bb9","contraintes":"df0eee1234bdf1d3836a85042138c2c66e62410866088d3bde282e5e6b9a8716","declencheurs":"67edf64125e3562a56a68a6163a9ff878f626a133b7ee1096be0d2442c1069a1"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
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


do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"679e120c3a8474b7093e3f84ef1421c9f6c00afbb25b0b4b7124e98ef1f45a08","indexes":"ab4ce0d9439ec702d1656ca0bd347ea1b81a0411f9c861a92c72c548a32870d2","colonnes":"40a55e9b7413cd8ae4d3d7bdd34a2e6e80d659d224c8dfa4db5c12d3890a2175","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"d4bf9a989f77c2d04c2224b32b09742b9333e0be08ff899ec2937437d8d112fa","politiques":"7021234319bdc7b6269ab2b220a8d50f636651938b05f46ba6a41a425fa00bb9","contraintes":"769e10c5122e89f34e48160e030a840abac5cfcf0585039685fd94e298e76fa8","declencheurs":"67edf64125e3562a56a68a6163a9ff878f626a133b7ee1096be0d2442c1069a1"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
