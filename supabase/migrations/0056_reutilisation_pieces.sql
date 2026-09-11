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
