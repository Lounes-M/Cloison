-- Transaction annulee : uniquement des identifiants et preuves fictifs.
do $essai$
declare d uuid:=gen_random_uuid();o uuid:=gen_random_uuid();r text;refuse boolean;n integer;
begin
 insert into public.suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256,compte_base,inscrit_le)
 values(o,d,d,'acces','recue',now(),now()+interval '1 day',now()+interval '2 days',repeat('a',64),'falsifie','2000-01-01');
 if not exists(select 1 from public.suivi_demandes_droits where operation=o and compte_base=session_user and inscrit_le>=transaction_timestamp()) then raise exception 'Inscription falsifiable';end if;
 foreach r in array array['anon','authenticated','porteur_lien','serveur','depot_piece','service_role'] loop
  execute format('set local role %I',r);
  refuse:=false;
  begin perform * from public.suivi_demandes_droits;exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Lecture des droits ouverte';end if;
  refuse:=false;
  begin insert into public.suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
   values(gen_random_uuid(),d,d,'acces','recue',now(),now()+interval '1 day',now()+interval '2 days',repeat('a',64));
  exception when insufficient_privilege then refuse:=true;end;
  if not refuse then raise exception 'Ecriture des droits ouverte';end if;
  if r<>'serveur' then
   refuse:=false;
   begin perform public.purger_suivis_droits();exception when insufficient_privilege then refuse:=true;end;
   if not refuse then raise exception 'Purge des droits ouverte';end if;
  end if;
  reset role;
 end loop;
 grant select on public.suivi_demandes_droits to authenticated;
 set local role authenticated;
 select count(*) into n from public.suivi_demandes_droits;
 reset role;
 revoke select on public.suivi_demandes_droits from authenticated;
 if n<>0 then raise exception 'RLS des droits ouverte';end if;
 begin
  update public.suivi_demandes_droits set etat='en_cours' where operation=o;
  raise exception 'Modification acceptee';
 exception when raise_exception then if sqlerrm<>'Etape administrative immuable' then raise;end if;end;
 begin
  delete from public.suivi_demandes_droits where operation=o;
  raise exception 'Suppression acceptee';
 exception when raise_exception then if sqlerrm<>'Suppression reservee a la retention' then raise;end if;end;
 -- Vieillissement cible uniquement pour verifier une purge effective.
 alter table public.suivi_demandes_droits disable trigger droits_etapes_immuables;
 update public.suivi_demandes_droits set recu_le=now()-interval '3 days',repondre_avant=now()-interval '2 days',effacer_le=now()-interval '1 day' where demande=d;
 alter table public.suivi_demandes_droits enable trigger droits_etapes_immuables;
 set local role serveur;
 n:=public.purger_suivis_droits();
 reset role;
 if n<1 or exists(select 1 from public.suivi_demandes_droits where demande=d) then raise exception 'Suivi expire conserve';end if;
 if current_setting('cloison.purge_droits',true)='active' then raise exception 'Autorisation de purge persistante';end if;
end;$essai$;
