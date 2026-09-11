begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"12eb9f8cd81c18f18415a4379e14c8b044c4a942de46a0a0fbbc0b307e147f62","indexes":"22bf95eef8b9bed40519e00f453453a0314ac7fcf5764ab6714207f15236e451","colonnes":"3685fd15abc853d9936b59ef65fa3268cc233b6ca14af2ad419cfa5b535a542f","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"2d4354a2efdb20e9e33d375a57f45bf249a96e811ebb34acc7f6606f1d9fbd47","politiques":"fc1958c0a80a7d386f5629e970e73384300f3f60e3828c1bc8bf7b7a02d2cd1b","contraintes":"47ba7411c28bcd8b86667f705acc047dc112dfeed8c3ea23670ec024f5dc96a3","declencheurs":"dc31282e0ed93fdbcdddd82c68855d918a03d0b985d86df46c45018af226ed68"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
-- Une copie est une piece independante du dossier destinataire.
create table public.provenances_pieces (
 piece_id uuid primary key references public.pieces(id) on delete cascade,
 dossier_id uuid not null references public.dossiers(id) on delete cascade,
 source_piece_id uuid not null,
 source_deposee_le timestamptz not null,
 empreinte_original text not null check(empreinte_original ~ '^[a-f0-9]{64}$'),
 consentement_version text not null check(consentement_version='copie-v1'),
 copiee_le timestamptz not null default clock_timestamp(),
 unique(dossier_id,source_piece_id)
);
alter table public.provenances_pieces enable row level security;
revoke all on public.provenances_pieces from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant select on public.provenances_pieces to porteur_lien;
create policy "Garant lit la provenance de ses copies" on public.provenances_pieces for select to porteur_lien
 using(dossier_id=public.dossier_courant() and public.partie_courante()='garant');

create function public.inscrire_provenance_piece() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb; p public.pieces; source uuid;
begin
 c:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 if not coalesce(c ? 'copie_version',false) then return new;end if;
 if current_setting('role',true)<>'depot_piece' or c->>'copie_version' is distinct from 'copie-v1'
 or c->>'copie_empreinte' is null or c->>'copie_empreinte' !~ '^[a-f0-9]{64}$' then
  raise exception 'Copie non autorisee';end if;
 source:=(c->>'copie_dossier')::uuid;
 if source is null or source=new.dossier_id then raise exception 'Copie non autorisee';end if;
 perform 1 from public.dossiers where id=source and expire_le>clock_timestamp() and coffre_purge_le is null for share;
 if not found then raise exception 'Copie non autorisee';end if;
 perform 1 from public.jetons_actifs where dossier_id=source and partie='garant'
 and jti=(c->>'copie_jti')::uuid and expire_le>clock_timestamp() for share;
 if not found then raise exception 'Copie non autorisee';end if;
 select * into p from public.pieces where id=(c->>'copie_piece')::uuid and dossier_id=source for share;
 if not found or p.type is distinct from new.type or p.type_reel is distinct from new.type_reel or p.taille_octets is distinct from new.taille_octets
 or p.nombre_documents is distinct from new.nombre_documents then raise exception 'Copie non autorisee';end if;
 if not exists(select 1 from public.dossiers d join public.jetons_actifs j on j.dossier_id=d.id
 where d.id=source and d.expire_le>clock_timestamp() and d.coffre_purge_le is null
 and j.partie='garant' and j.jti=(c->>'copie_jti')::uuid and j.expire_le>clock_timestamp()) then raise exception 'Copie non autorisee';end if;
 insert into public.provenances_pieces(piece_id,dossier_id,source_piece_id,source_deposee_le,empreinte_original,consentement_version)
 values(new.id,new.dossier_id,p.id,p.depose_le,c->>'copie_empreinte','copie-v1');
 return new;
exception when invalid_text_representation then raise exception 'Copie non autorisee';
end;$$;
revoke all on function public.inscrire_provenance_piece() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger inscrire_provenance_piece after insert on public.pieces for each row execute function public.inscrire_provenance_piece();
notify pgrst,'reload schema';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"0c1f3968066b02fe8e41b0a8e76dfc6b27a6a6433139aa463f2f80d9a58acb18","indexes":"9ebd5749adaebd1ce0262e53771600da3ba3ba628ccb90db6e3a9cf3892a8955","colonnes":"d2495dcd7b022c043f1b714089ef88b87478f97f09534fc350e0703734f8c474","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"be248a9023a253e9a265a4282c8a330e4e82cf2de6d31f1591feacca7bfbd84b","politiques":"e4e35953020acc79342c247f5fcc7ee09c38c9d7e9e15f8c45fb4ffb85e3e55c","contraintes":"0560b48a929c024dc2ed42642e4d1bf0a4b7c203cad7b2a7e462acc2df2da3f1","declencheurs":"5bb0276a6d2224e91106c0fbb30ff8233c52968a50a83979fdbb603a89d0439b"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
