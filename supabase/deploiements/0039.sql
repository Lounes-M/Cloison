begin;
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"5e967208d1544790baee0a6493a3f6f745897133fb6cf6fc21e1895e7a7dbb36","indexes":"69bc310736c80aad8996dc5ccb2cdf7f573ccf3c9067a6729139a71498ba6584","colonnes":"d22d5395ef60d55342ffe9070199c76a19bbcfabc3c837d7ed5548a5df87dd42","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"f494b3f117112abbb2262f17f25b172295610c4fe4e6faf43e7986e8b9cf9867","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"c34c12d0c1658c6923d6ae2c5f80da93ae189a8518fecdea5dfff4c80e17046f","declencheurs":"d82b391c3ca00c8c80d7e8442b7306e41d774d21ab8e009fe4758850ae5be4be"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
-- Confirmation applicative partagee entre les differents declencheurs.
create table public.maintenance_courante (
 unique_ligne boolean primary key default true check(unique_ligne),
 derniere_reussite timestamptz
);
insert into public.maintenance_courante(unique_ligne) values(true);
alter table public.maintenance_courante enable row level security;
revoke all on public.maintenance_courante from public,anon,authenticated,porteur_lien,serveur,depot_piece;
create function public.confirmer_maintenance()
returns boolean language sql security definer set search_path='' as $$
 update public.maintenance_courante set derniere_reussite=clock_timestamp() where unique_ligne returning true;
$$;
create function public.etat_maintenance()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('derniere_reussite',derniere_reussite) from public.maintenance_courante where unique_ligne;
$$;
revoke all on function public.confirmer_maintenance(),public.etat_maintenance() from public,anon,authenticated,porteur_lien,depot_piece;
grant execute on function public.confirmer_maintenance(),public.etat_maintenance() to serveur;


do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"e23a2e3ac7d2ffd1db4639cbe51e989c1e840e9bf6bdd040501f32788f8e9e3d","indexes":"635bfc84dd636a85afc1a7accd468ea2bfa2b994c140d2e0de26322af9450781","colonnes":"370002e4f177befaf716f786a7c2f26fdfdb854727e7524e86a6263db1e88158","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"ae5b04c2a2a12944db7b5b8a46876be7e8719a633830b6b702f95df2d800f003","politiques":"1f14b36c55bca466c2c7aa98776b04e310e15e9f56ad9ebd9d53cbe7273ad765","contraintes":"8fde237a28caef8ecc8d01db43d0c57c9e1d17138983f75ad8257da20e17fad4","declencheurs":"d82b391c3ca00c8c80d7e8442b7306e41d774d21ab8e009fe4758850ae5be4be"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner'; end if; end $controle$;
commit;
