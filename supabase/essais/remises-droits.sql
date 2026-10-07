do $droits$ declare r text; f text; begin
 foreach r in array array['anon','authenticated','porteur_lien','serveur','depot_piece','archive_signature','service_role'] loop
  if has_table_privilege(r,'public.remises_droits','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Droits directs indus';end if;
  foreach f in array array['public.autoriser_remise_droits(uuid,text,text,boolean)','public.remises_droits_a_purger()','public.acquitter_remise_droits(text)'] loop
   if has_function_privilege(r,f,'EXECUTE')<>(r='serveur') then raise exception 'Droits de fonction indus';end if;
  end loop;
 end loop;
 if not exists(select 1 from storage.buckets where id='exports-droits' and not public) then raise exception 'Bucket non prive';end if;
end $droits$;
