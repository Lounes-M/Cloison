-- Entre BEGIN et ROLLBACK. Aucune date fournie par l'appelant.
set local role serveur;
do $droits$
begin
 if not public.confirmer_maintenance() then raise exception 'Confirmation absente'; end if;
 if public.etat_maintenance()->>'derniere_reussite' is null then raise exception 'Date absente'; end if;
end $droits$;
reset role;
do $prive$
begin
 if has_function_privilege('anon','public.confirmer_maintenance()','execute')
 or has_function_privilege('authenticated','public.etat_maintenance()','execute')
 or has_table_privilege('serveur','public.maintenance_courante','update') then
 raise exception 'Confirmation exposee'; end if;
end $prive$;
