-- Metadonnees fictives uniquement. Executer dans BEGIN puis ROLLBACK.
select set_config('cloison.copie_source',gen_random_uuid()::text,true);
select set_config('cloison.copie_cible',gen_random_uuid()::text,true);
select set_config('cloison.copie_piece',gen_random_uuid()::text,true);
select set_config('cloison.copie_id',gen_random_uuid()::text,true);
select set_config('cloison.copie_jti',gen_random_uuid()::text,true);
select set_config('cloison.copie_jti_cible',gen_random_uuid()::text,true);
insert into public.dossiers(id,email_locataire,reference)
select current_setting(k)::uuid,'copie@fixture.invalid','CP'||substr(current_setting(k),1,12)
from unnest(array['cloison.copie_source','cloison.copie_cible']) k;
insert into public.jetons_actifs(dossier_id,partie,jti,expire_le)
select current_setting(k)::uuid,'garant',current_setting(case when k='cloison.copie_source' then 'cloison.copie_jti' else 'cloison.copie_jti_cible' end)::uuid,clock_timestamp()+interval '1 day'
from unnest(array['cloison.copie_source','cloison.copie_cible']) k;
insert into public.reservations_depot(dossier_id,chemin) values
(current_setting('cloison.copie_source')::uuid,current_setting('cloison.copie_source')||'/'||current_setting('cloison.copie_piece')),
(current_setting('cloison.copie_cible')::uuid,current_setting('cloison.copie_cible')||'/'||current_setting('cloison.copie_id'));
insert into storage.objects(bucket_id,name) values
('pieces',current_setting('cloison.copie_source')||'/'||current_setting('cloison.copie_piece')),
('pieces',current_setting('cloison.copie_cible')||'/'||current_setting('cloison.copie_id'));
select set_config('request.jwt.claims',jsonb_build_object('role','depot_piece','role_partie','garant','dossier_id',current_setting('cloison.copie_source'),'jti',current_setting('cloison.copie_jti'))::text,true);
set local role depot_piece;
insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values
(current_setting('cloison.copie_piece')::uuid,current_setting('cloison.copie_source')::uuid,'piece_identite',current_setting('cloison.copie_source')||'/'||current_setting('cloison.copie_piece'),100,'application/pdf');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','depot_piece','role_partie','garant','dossier_id',current_setting('cloison.copie_cible'),'jti',current_setting('cloison.copie_jti_cible'),'copie_version','copie-v1','copie_dossier',current_setting('cloison.copie_source'),'copie_jti',current_setting('cloison.copie_jti'),'copie_piece',current_setting('cloison.copie_piece'),'copie_empreinte',repeat('a',64))::text,true);
set local role depot_piece;
insert into public.pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values
(current_setting('cloison.copie_id')::uuid,current_setting('cloison.copie_cible')::uuid,'piece_identite',current_setting('cloison.copie_cible')||'/'||current_setting('cloison.copie_id'),100,'application/pdf');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','role_partie','garant','dossier_id',current_setting('cloison.copie_cible'),'jti',current_setting('cloison.copie_jti_cible'))::text,true);
set local role porteur_lien;
do $$ begin
 if (select count(*) from public.provenances_pieces)<>1 then raise exception 'Copie non visible par son garant';end if;
 begin delete from public.provenances_pieces;raise exception 'Ecriture non refusee';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('role','porteur_lien','role_partie','locataire','dossier_id',current_setting('cloison.copie_cible'),'jti',current_setting('cloison.copie_jti_cible'))::text,true);
do $$ begin if exists(select 1 from public.provenances_pieces) then raise exception 'Provenance visible du locataire';end if;end $$;
reset role;
delete from public.pieces where id=current_setting('cloison.copie_piece')::uuid;
do $$ begin
 if not exists(select 1 from public.provenances_pieces where piece_id=current_setting('cloison.copie_id')::uuid) then raise exception 'Copie detruite avec sa source';end if;
end $$;
delete from public.pieces where id=current_setting('cloison.copie_id')::uuid;
do $$ begin
 if exists(select 1 from public.provenances_pieces where piece_id=current_setting('cloison.copie_id')::uuid) then raise exception 'Provenance orpheline';end if;
end $$;
