-- A executer dans une transaction annulee, apres 0033. Fixtures sans document.
do $fixture$
declare u uuid := gen_random_uuid(); a uuid := gen_random_uuid(); d uuid := gen_random_uuid();
begin
  perform set_config('cloison.essai_utilisateur',u::text,true);
  perform set_config('cloison.essai_dossier',d::text,true);
  insert into auth.users(id,email,email_confirmed_at)
    values(u,'fixture@'||u::text||'.invalid',now());
  insert into public.agences(id,nom,domaine) values(a,'Essai transactionnel',u::text||'.invalid');
  insert into public.membres_agence(agence_id,utilisateur_id,role) values(a,u,'admin');
  insert into public.dossiers(id,agence_id,email_locataire) values(d,a,'fixture@example.invalid');
  insert into public.engagements(dossier_id) values(d);
  insert into public.pieces(dossier_id,type,chemin,taille_octets,type_reel)
    values(d,'bulletin_paie',d::text||'/fixture',100,'application/pdf');
  insert into public.cles_dossier(dossier_id,cle_scellee) values(d,decode(repeat('ab',60),'hex'));
  insert into storage.objects(bucket_id,name) values('pieces',d::text||'/fixture');
  perform set_config('request.jwt.claims',json_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $acces$
begin
  if not exists(select 1 from public.dossiers where id=current_setting('cloison.essai_dossier')::uuid) then
    raise exception 'Fixture agence non autorisee avant echeance';
  end if;
  perform public.journaliser(current_setting('cloison.essai_dossier')::uuid,'dossier_consulte');
end $acces$;
reset role;
update public.dossiers set cree_le=now()-interval '4 months', expire_le=now()-interval '1 second'
  where id=current_setting('cloison.essai_dossier')::uuid;
set local role authenticated;
do $refus$
declare d uuid:=current_setting('cloison.essai_dossier')::uuid; interdit boolean:=false;
begin
  if exists(select 1 from public.dossiers where id=d)
    or exists(select 1 from public.engagements where dossier_id=d)
    or exists(select 1 from public.pieces where dossier_id=d)
    or exists(select 1 from public.cles_dossier where dossier_id=d)
    or exists(select 1 from public.journal_acces where dossier_id=d)
    or exists(select 1 from storage.objects where bucket_id='pieces' and name=d::text||'/fixture') then
    raise exception 'Acces expire encore autorise';
  end if;
  begin
    perform public.journaliser(d,'dossier_consulte');
  exception when insufficient_privilege then interdit:=true;
  end;
  if not interdit then raise exception 'Journalisation expiree encore autorisee'; end if;
end $refus$;
reset role;
