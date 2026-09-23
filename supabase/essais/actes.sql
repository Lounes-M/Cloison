-- A executer dans une transaction annulee apres application du lot.
do $droits$
declare r text; refuse boolean;
begin
 foreach r in array array['anon','authenticated','porteur_lien','depot_piece','service_role','archive_signature'] loop
  execute format('set local role %I',r);
  refuse:=false;
  begin perform public.publier_archive_signature(gen_random_uuid(),0);exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Publication accessible a un role non autorise';end if;
  refuse:=false;
  begin perform public.rapprocher_reglement_acte(gen_random_uuid(),gen_random_uuid(),'cs_fixture','pi_fixture',2900,'eur','acte-2026-09-04','paye',0,false);exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Reglement accessible a un role non autorise';end if;
  refuse:=false;
  begin perform 1 from public.actes_signature limit 1;exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Archive brute accessible';end if;
  refuse:=false;
  begin perform 1 from public.reglements_actes limit 1;exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Reglement brut accessible';end if;
  reset role;
 end loop;
end $droits$;
set local role serveur;
do $serveur$ begin
 if public.publier_archive_signature(gen_random_uuid(),0) is distinct from false then raise exception 'Archive absente acceptee';end if;
 if public.rapprocher_reglement_acte(gen_random_uuid(),gen_random_uuid(),'cs_fixture','pi_fixture',2900,'eur','acte-2026-09-04','paye',0,false) is distinct from false then raise exception 'Facture absente acceptee';end if;
end $serveur$;
reset role;
set local role authenticated;
do $agence$ begin
 if public.lire_acte_signature(gen_random_uuid()) is not null then raise exception 'Archive anonyme acceptee';end if;
 if public.reserver_reglement_acte(gen_random_uuid()) is not null then raise exception 'Reglement anonyme accepte';end if;
end $agence$;
reset role;
set local role porteur_lien;
do $garant$ begin
 if public.valider_acte_signature(gen_random_uuid(),repeat('a',64),true) is distinct from false then raise exception 'Consentement absent accepte';end if;
end $garant$;
reset role;
select true as droits_actes_confirmes;
