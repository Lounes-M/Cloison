-- A executer entre BEGIN et ROLLBACK, aucun compteur d'utilisateur reel.
set local role serveur;
do $droits$
declare cible text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text); ok boolean;
begin
  for i in 1..20 loop
    if not public.consommer_debit('depot_dossier',cible) then raise exception 'Refus premature'; end if;
  end loop;
  if public.consommer_debit('depot_dossier',cible) then raise exception 'Quota depassable'; end if;
  if not public.consommer_debit('depot_global',cible) then raise exception 'Compteur global absent'; end if;
end $droits$;
reset role;
do $prive$
begin
  if has_function_privilege('porteur_lien','public.consommer_debit(text,text)','execute')
    or has_function_privilege('authenticated','public.consommer_debit(text,text)','execute')
    or has_function_privilege('anon','public.consommer_debit(text,text)','execute') then
    raise exception 'Compteur expose';
  end if;
end $prive$;

