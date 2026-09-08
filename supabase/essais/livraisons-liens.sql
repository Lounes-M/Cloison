-- A executer entre BEGIN et ROLLBACK, sans envoi fournisseur.
set local role serveur;
do $droits$
declare d record; intention record; refus boolean:=false;
begin
 select * into d from public.ouvrir_dossier_avec_lien('fixture-'||gen_random_uuid()::text||'@example.invalid','7 days');
 select * into intention from public.liens_a_livrer(d.dossier_id);
 if intention.id is distinct from d.jti then raise exception 'Intention non atomique'; end if;
 begin perform public.mettre_lien_en_file(d.jti,'');
 exception when check_violation then refus:=true; end;
 if not refus then raise exception 'Mise en file vide acceptee'; end if;
 if not public.mettre_lien_en_file(d.jti,'Y2hpZmZyZQ==') then raise exception 'Mise en file refusee'; end if;
 if not public.mettre_lien_en_file(d.jti,'Y2hpZmZyZQ==') then raise exception 'Reprise non idempotente'; end if;
 perform public.emettre_jeton(d.dossier_id,'locataire','7 days');
 if exists(select 1 from public.prendre_courriels(d.jti)) then raise exception 'Ancien lien distribuable'; end if;
end $droits$;
reset role;
do $prive$
begin
 if has_table_privilege('porteur_lien','public.livraisons_liens','select')
  or has_function_privilege('authenticated','public.liens_a_livrer(uuid)','execute')
  or has_function_privilege('anon','public.mettre_lien_en_file(uuid,text)','execute') then
  raise exception 'Livraisons exposees';
 end if;
end $prive$;
