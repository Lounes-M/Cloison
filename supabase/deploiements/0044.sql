begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"1a628b0a8f7fd6453d602dc85e4bb4b9d75d836de3fb9a1384dc09101af0303d","indexes":"3ad6ffd45d363f5874c15a59e00aef16544d49a3766a96e134213064598ccd3e","colonnes":"99310b6b71bb65bdd72782c38896df4987e2a66881e1eed7c298e071955bc924","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ae6160f61e491f30dd00269bebd70bd5e7025cef952080e1a1454aa7f3911756","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"3c53b9d89dd32c78b60d60a7f5665a6302723d5c3eb8eb76725923407618efb8","declencheurs":"b5ef5b7216a1428580cddb000914ab6be17a0667645b15ee1edebd2e223d3e71"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
-- Rattraper les sessions reservees sans webhook, sans creer de paiement fournisseur.
create or replace function public.paiements_a_rapprocher()
returns table(reference_session text) language sql stable security definer set search_path='' as $$
 with candidats as (
  select r.reference_session,r.recu_le from public.registre_paiements r
   where r.origine='historique' or r.paye_fournisseur=false
  union all
  select e.reference_session,e.recu_le from public.evenements_paiements e
   where e.reference_session is not null and e.nature<>'paiement'
   and not exists(select 1 from public.registre_paiements r where r.reference_session=e.reference_session)
  union all
  select s.session_ref,s.cree_le from public.sessions_paiement s
   join public.dossiers d on d.id=s.dossier_id
   where s.session_ref is not null and s.cree_le<=now()-interval '15 minutes'
   and d.expire_le>now()
   and not exists(select 1 from public.registre_paiements r where r.reference_session=s.session_ref)
 ), uniques as (
  select c.reference_session,min(c.recu_le) recu_le from candidats c group by c.reference_session
 )
 select c.reference_session from uniques c
 left join public.tentatives_rapprochement t on t.reference_session=c.reference_session
 where t.essaye_le is null or t.essaye_le<=now()-interval '15 minutes'
 order by t.essaye_le nulls first,c.recu_le,c.reference_session limit 2;
$$;
revoke all on function public.paiements_a_rapprocher() from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.paiements_a_rapprocher() to serveur;

-- La preuve fournisseur doit correspondre a la session reservee pour ce dossier.
create or replace function public.rapprocher_paiement(reference_session text,reference_paiement text,le_dossier uuid,montant integer,devise text,version_tarif text,paye boolean)
returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare session public.sessions_paiement; regle public.registre_paiements; tarif public.tarifs_paiement; anomalie boolean; confirme boolean:=false; present uuid;
begin
 if reference_session is null or reference_session !~ '^cs_[A-Za-z0-9_]{1,196}$' or (reference_paiement is not null and reference_paiement !~ '^pi_[A-Za-z0-9_]{1,196}$')
 or le_dossier is null or montant is null or montant not between 1 and 100000000 or devise is null or devise !~ '^[a-z]{3}$'
 or version_tarif is null or version_tarif !~ '^[a-z0-9-]{1,64}$' or paye is null or (paye and reference_paiement is null) then raise exception 'Rapprochement financier invalide'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('paiement:'||coalesce(reference_paiement,reference_session),0));
 select d.id into present from public.dossiers d where d.id=le_dossier for update;
 select * into regle from public.registre_paiements r where r.reference_session=reference_session for update;
 if found and regle.source_dossier<>le_dossier then raise exception 'Contexte financier different'; end if;
 select * into tarif from public.tarifs_paiement t where t.version=version_tarif;
 anomalie:=not found or tarif.montant_cents is distinct from montant or tarif.devise is distinct from devise;
 select * into session from public.sessions_paiement s where s.dossier_id=le_dossier;
 if found and (session.tarif_version<>version_tarif or session.montant_cents<>montant or session.devise<>devise
  or (session.session_ref is not null and session.session_ref<>reference_session)) then anomalie:=true; end if;
 if exists(select 1 from public.sessions_paiement s where s.session_ref=reference_session and s.dossier_id<>le_dossier) then anomalie:=true;end if;
 if reference_paiement is not null and exists(select 1 from public.registre_paiements r where r.reference_paiement=reference_paiement and r.reference_session<>reference_session) then anomalie:=true; end if;
 if regle.reference_session is not null then
  anomalie:=anomalie or regle.anomalie or (regle.reference_paiement is not null and regle.reference_paiement is distinct from reference_paiement) or regle.tarif_version<>version_tarif;
  confirme:=regle.marque;
  if paye and not anomalie and not confirme then
   begin confirme:=public.marquer_dossier_paye(le_dossier,reference_session); exception when unique_violation then anomalie:=true; end;
  end if;
  update public.registre_paiements r set marque=confirme,reference_paiement=rapprocher_paiement.reference_paiement,montant_cents=montant,devise=rapprocher_paiement.devise,origine='rapprochement',paye_fournisseur=paye,anomalie=anomalie where r.reference_session=rapprocher_paiement.reference_session;
 else
  if paye and not anomalie then
   begin confirme:=public.marquer_dossier_paye(le_dossier,reference_session);
   exception when unique_violation then anomalie:=true; end;
  end if;
  insert into public.registre_paiements(reference_session,reference_paiement,dossier_id,source_dossier,montant_cents,devise,tarif_version,marque,anomalie,survenu_le,origine,paye_fournisseur)
  values(reference_session,reference_paiement,present,le_dossier,montant,devise,version_tarif,confirme,anomalie,now(),'rapprochement',paye);
 end if;
 insert into public.rapprochements_paiements(reference_session,reference_paiement,montant_cents,devise,paye)
 values(reference_session,reference_paiement,montant,devise,paye) on conflict do nothing;
 return true;
end $$;
revoke all on function public.rapprocher_paiement(text,text,uuid,integer,text,text,boolean) from public,anon,authenticated,porteur_lien,serveur,depot_piece;
grant execute on function public.rapprocher_paiement(text,text,uuid,integer,text,text,boolean) to serveur;


do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"1a628b0a8f7fd6453d602dc85e4bb4b9d75d836de3fb9a1384dc09101af0303d","indexes":"3ad6ffd45d363f5874c15a59e00aef16544d49a3766a96e134213064598ccd3e","colonnes":"99310b6b71bb65bdd72782c38896df4987e2a66881e1eed7c298e071955bc924","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"226d38bba9a52c53238066730ff59e78cc65350024d126f2760461794dfe103c","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"3c53b9d89dd32c78b60d60a7f5665a6302723d5c3eb8eb76725923407618efb8","declencheurs":"b5ef5b7216a1428580cddb000914ab6be17a0667645b15ee1edebd2e223d3e71"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
