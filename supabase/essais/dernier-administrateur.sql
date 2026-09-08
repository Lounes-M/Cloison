-- Apres 0035, entre BEGIN et ROLLBACK. Fixtures sans donnees de dossier.
do $fixture$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
begin
  if has_function_privilege('anon','public.conserver_administrateur()','execute')
    or has_function_privilege('authenticated','public.conserver_administrateur()','execute') then
    raise exception 'Declencheur expose';
  end if;
  insert into public.agences(id,nom,domaine) values(a,'Administration fictive',a::text||'.invalid');
  insert into auth.users(id,email,email_confirmed_at)
    values(u,'a@'||a::text||'.invalid',now()),(v,'b@'||a::text||'.invalid',now());
  insert into public.membres_agence(agence_id,utilisateur_id,role)
    values(a,u,'admin'),(a,v,'membre');
  perform set_config('cloison.essai_agence',a::text,true);
  perform set_config('cloison.essai_premier',u::text,true);
  perform set_config('cloison.essai_second',v::text,true);
  perform set_config('request.jwt.claims',json_build_object('role','authenticated','sub',u,'aal','aal2')::text,true);
end $fixture$;
set local role authenticated;
do $droits$
declare u uuid:=current_setting('cloison.essai_premier')::uuid;
  v uuid:=current_setting('cloison.essai_second')::uuid; interdit boolean:=false;
begin
  begin
    update public.membres_agence set role='membre' where utilisateur_id=u;
  exception when check_violation then interdit:=true;
  end;
  if not interdit then raise exception 'Dernier administrateur perdu'; end if;
  update public.membres_agence set role='admin' where utilisateur_id=v;
  update public.membres_agence set role='membre' where utilisateur_id=u;
  if (select count(*) from public.membres_agence where agence_id=current_setting('cloison.essai_agence')::uuid and role='admin') <> 1 then
    raise exception 'Relais invalide';
  end if;
end $droits$;
reset role;
