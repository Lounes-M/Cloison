-- Les octets ne sont televerses que par le serveur apres validation/chiffrement.
create role depot_piece nologin noinherit;
grant depot_piece to authenticator;
grant usage on schema public,storage to depot_piece;
grant select on storage.buckets to depot_piece;
grant select,insert,delete on storage.objects to depot_piece;
grant execute on function public.dossier_courant() to depot_piece;
revoke insert on storage.objects from porteur_lien;
create policy "Le serveur depose pour une capacite active" on storage.objects
for insert to depot_piece with check (bucket_id='pieces' and nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role_partie'='garant' and name like public.dossier_courant()::text||'/%');
create policy "Le serveur retrouve son depot" on storage.objects
for select to depot_piece using (bucket_id='pieces' and nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role_partie'='garant' and name like public.dossier_courant()::text||'/%');
create policy "Le serveur rattrape son depot" on storage.objects
for delete to depot_piece using (bucket_id='pieces' and nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role_partie'='garant' and name like public.dossier_courant()::text||'/%');
