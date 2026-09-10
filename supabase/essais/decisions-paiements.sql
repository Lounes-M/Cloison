-- A executer dans une transaction annulee, uniquement avec des fixtures.
do $essai$
declare d uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  reference text := 'cs_essai_decision_' || replace(d::text,'-','');
  r text; refuse boolean; nombre integer;
begin
  insert into public.dossiers(id,email_locataire) values(d,'decision@essai.invalid');
  insert into public.sessions_paiement(dossier_id,session_ref) values(d,reference);
  insert into public.decisions_paiements(operation,operateur,reference_session,decision,rapport_sha256,rapport_observe_le,compte_base,inscrit_le)
    values(o,d,reference,'a_examiner',repeat('a',64),now(),'falsifie','2000-01-01');
  if not exists(select 1 from public.decisions_paiements where operation=o and compte_base=session_user and inscrit_le>now()-interval '1 minute') then
    raise exception 'Auteur ou horloge administrative falsifiable';
  end if;
  foreach r in array array['anon','authenticated','service_role','porteur_lien','serveur','depot_piece'] loop
    execute format('set local role %I',r);
    refuse := false;
    begin execute 'select * from public.decisions_paiements'; exception when insufficient_privilege then refuse:=true; end;
    if not refuse then raise exception 'Lecture administrative ouverte'; end if;
    refuse := false;
    begin
      insert into public.decisions_paiements(operation,operateur,reference_session,decision,rapport_sha256,rapport_observe_le)
        values(gen_random_uuid(),d,reference,'corrige',repeat('b',64),now());
    exception when insufficient_privilege then refuse:=true; end;
    if not refuse then raise exception 'Ecriture administrative ouverte'; end if;
    reset role;
  end loop;
  grant select on public.decisions_paiements to authenticated;
  set local role authenticated;
  select count(*) into nombre from public.decisions_paiements;
  reset role;
  revoke select on public.decisions_paiements from authenticated;
  if nombre<>0 then raise exception 'RLS administrative ouverte'; end if;
  begin
    update public.decisions_paiements set decision='corrige' where operation=o;
    raise exception 'Modification administrative acceptee';
  exception when raise_exception then if sqlerrm<>'Decision administrative immuable' then raise; end if; end;
  begin
    delete from public.decisions_paiements where operation=o;
    raise exception 'Suppression administrative acceptee';
  exception when raise_exception then if sqlerrm<>'Decision administrative immuable' then raise; end if; end;
  delete from public.dossiers where id=d;
  if not exists(select 1 from public.decisions_paiements where operation=o) then raise exception 'Historique administratif perdu'; end if;
end;
$essai$;
