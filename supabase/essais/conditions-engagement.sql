-- Dans une transaction annulee, apres 0034. Aucune donnee reelle.
do $fixture$
declare d uuid:=gen_random_uuid(); j uuid:=gen_random_uuid();
begin
  if has_function_privilege('anon','public.versionner_conditions()','execute')
    or has_function_privilege('authenticated','public.versionner_conditions()','execute')
    or has_function_privilege('porteur_lien','public.versionner_conditions()','execute') then
    raise exception 'Fonction de declencheur directement accessible';
  end if;
  insert into public.dossiers(id,email_locataire) values(d,'conditions@example.invalid');
  insert into public.jetons_actifs(dossier_id,partie,jti,expire_le)
    values(d,'garant',j,now()+interval '1 day');
  perform set_config('cloison.essai_dossier',d::text,true);
  perform set_config('request.jwt.claims',json_build_object('role','porteur_lien',
    'dossier_id',d,'role_partie','garant','jti',j)::text,true);
end $fixture$;
set local role porteur_lien;
do $droits$
declare d uuid:=current_setting('cloison.essai_dossier')::uuid;
  e public.engagements; n integer; interdit boolean:=false;
  texte text:='Mention fictive incomplete utilisee pour verifier les droits SQL uniquement.';
begin
  insert into public.engagements(dossier_id,montant_max_cents,version_conditions)
    values(d,1200000,999) returning * into e;
  if e.version_conditions <> 1 then raise exception 'Version initiale falsifiable'; end if;
  update public.engagements set mention=texte,mention_saisie_le=now() where dossier_id=d;
  update public.engagements set montant_max_cents=1300000 where dossier_id=d returning * into e;
  if e.version_conditions <> 2 or e.mention is not null or e.mention_saisie_le is not null then
    raise exception 'Mention ancienne conservee';
  end if;
  update public.engagements set mention=texte,mention_saisie_le=now()
    where dossier_id=d and version_conditions=1;
  get diagnostics n=row_count;
  if n <> 0 then raise exception 'Ecriture perimee acceptee'; end if;
  update public.engagements set mention=texte,mention_saisie_le=now()
    where dossier_id=d and version_conditions=2;
  get diagnostics n=row_count;
  if n <> 1 then raise exception 'Ecriture courante refusee'; end if;
  update public.engagements set revenu_net_mensuel_cents=320000,couvre=couvre
    where dossier_id=d returning * into e;
  if e.version_conditions <> 2 or e.mention is distinct from texte then
    raise exception 'Conditions identiques invalidees';
  end if;
  begin
    update public.engagements set version_conditions=1 where dossier_id=d;
  exception when insufficient_privilege then interdit:=true;
  end;
  if not interdit then raise exception 'Version modifiable directement'; end if;
end $droits$;
reset role;
