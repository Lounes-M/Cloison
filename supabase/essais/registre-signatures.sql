-- Catalogue et droits reels ; executer dans une transaction annulee.
do $droits$
declare r text; t text; f text;
begin
 foreach r in array array['anon','authenticated','porteur_lien','depot_piece','serveur','service_role'] loop
  foreach t in array array['public.demandes_signature','public.evenements_signature'] loop
   if has_table_privilege(r,t,'select,insert,update,delete,truncate,references,trigger') then
    raise exception 'Acces direct au registre signature';
   end if;
   if not (select relrowsecurity from pg_class where oid=t::regclass) then
    raise exception 'RLS signature absente';
   end if;
  end loop;
  foreach f in array array[
   'public.preparer_demande_signature(uuid,text,text)',
   'public.rattacher_demande_signature(uuid,uuid,text)',
   'public.enregistrer_evenement_signature(text,uuid,uuid,text,timestamptz)',
   'public.reserver_signatures_a_rapprocher(text)',
   'public.confirmer_rapprochement_signature(uuid,text,uuid,bigint,uuid,uuid,text)',
   'public.echec_rapprochement_signature(uuid,text,uuid)',
   'public.signatures_a_examiner(text)'
  ] loop
   if has_function_privilege(r,f,'execute') is distinct from (r='serveur') then
    raise exception 'Droits RPC signature incorrects';
   end if;
  end loop;
 end loop;
end $droits$;
