begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"679e120c3a8474b7093e3f84ef1421c9f6c00afbb25b0b4b7124e98ef1f45a08","indexes":"ab4ce0d9439ec702d1656ca0bd347ea1b81a0411f9c861a92c72c548a32870d2","colonnes":"40a55e9b7413cd8ae4d3d7bdd34a2e6e80d659d224c8dfa4db5c12d3890a2175","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"d4bf9a989f77c2d04c2224b32b09742b9333e0be08ff899ec2937437d8d112fa","politiques":"7021234319bdc7b6269ab2b220a8d50f636651938b05f46ba6a41a425fa00bb9","contraintes":"769e10c5122e89f34e48160e030a840abac5cfcf0585039685fd94e298e76fa8","declencheurs":"67edf64125e3562a56a68a6163a9ff878f626a133b7ee1096be0d2442c1069a1"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
-- Acces d'integration a la seule projection reference/statut, sans justificatif.
create table public.connecteurs_agence (
 id uuid primary key default gen_random_uuid(),
 agence_id uuid not null references public.agences(id) on delete cascade,
 nom text not null check(char_length(nom) between 1 and 80),
 empreinte text not null unique check(empreinte ~ '^[a-f0-9]{64}$'),
 cree_par uuid not null references auth.users(id) on delete cascade,
 cree_le timestamptz not null default clock_timestamp(),
 expire_le timestamptz not null default clock_timestamp()+interval '90 days',
 revoque_le timestamptz,
 revoque_par uuid references auth.users(id) on delete set null,
 utilise_le timestamptz,
 fenetre timestamptz,
 compte integer not null default 0 check(compte>=0),
 check(expire_le>cree_le and expire_le<=cree_le+interval '91 days')
);
create index connecteurs_agence_recents on public.connecteurs_agence(agence_id,cree_le desc,id);
alter table public.connecteurs_agence enable row level security;
revoke all on public.connecteurs_agence from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant select(id,agence_id,nom,cree_par,cree_le,expire_le,revoque_le,revoque_par,utilise_le) on public.connecteurs_agence to authenticated;
create policy "Administrateur lit ses connecteurs" on public.connecteurs_agence for select to authenticated using (
 agence_id=public.agence_courante() and exists(select 1 from public.membres_agence m where m.agence_id=connecteurs_agence.agence_id and m.utilisateur_id=auth.uid() and m.role='admin')
);

create function public.creer_connecteur(le_nom text,l_empreinte text) returns uuid
language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante(); resultat uuid;
begin
 if agence is null or le_nom is null or char_length(trim(le_nom)) not between 1 and 80
 or l_empreinte is null or l_empreinte !~ '^[a-f0-9]{64}$'
 or not exists(select 1 from public.membres_agence where agence_id=agence and utilisateur_id=auth.uid() and role='admin') then return null;end if;
 -- Serialiser avec l'exclusion : aucune cle ne peut etre creee apres son retrait.
 perform 1 from public.membres_agence where agence_id=agence and utilisateur_id=auth.uid() and role='admin' for update;
 if not found then return null;end if;
 perform 1 from public.agences where id=agence for update;
 if (select count(*) from public.connecteurs_agence where agence_id=agence and revoque_le is null and expire_le>clock_timestamp())>=5
 or (select count(*) from public.connecteurs_agence where agence_id=agence and cree_le>clock_timestamp()-interval '1 day')>=20 then return null;end if;
 insert into public.connecteurs_agence(agence_id,nom,empreinte,cree_par) values(agence,trim(le_nom),l_empreinte,auth.uid()) returning id into resultat;
 return resultat;
end;$$;

create function public.revoquer_connecteur(le_connecteur uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.connecteurs_agence set revoque_le=coalesce(revoque_le,clock_timestamp()),revoque_par=coalesce(revoque_par,auth.uid())
 where id=le_connecteur and agence_id=public.agence_courante()
 and exists(select 1 from public.membres_agence m where m.agence_id=connecteurs_agence.agence_id and m.utilisateur_id=auth.uid() and m.role='admin');
 return found;
end;$$;

create function public.lire_statuts_connecteur(l_empreinte text,apres text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.connecteurs_agence; resultat jsonb; v_fenetre timestamptz:=date_bin(interval '1 minute',clock_timestamp(),timestamptz 'epoch');
begin
 if l_empreinte is null or l_empreinte !~ '^[a-f0-9]{64}$' or (apres is not null and char_length(apres) not between 8 and 32) then return null;end if;
 select * into c from public.connecteurs_agence where empreinte=l_empreinte for update;
 if c.id is null or c.revoque_le is not null or c.expire_le<=clock_timestamp()
 or not exists(select 1 from public.agences a join public.membres_agence m on m.agence_id=a.id join auth.users u on u.id=m.utilisateur_id
 where a.id=c.agence_id and a.statut<>'suspendue' and m.utilisateur_id=c.cree_par
 and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine) then return null;end if;
 if c.fenetre=v_fenetre and c.compte>=60 then return jsonb_build_object('limite',true);end if;
 update public.connecteurs_agence set utilise_le=clock_timestamp(),fenetre=v_fenetre,compte=case when c.fenetre=v_fenetre then c.compte+1 else 1 end where id=c.id;
 with selection as (
 select d.reference,case d.statut when 'complet' then 'pret' when 'transmis' then 'en_cours' when 'signe' then 'signe' when 'refuse' then 'clos' else 'a_completer' end etat
 from public.dossiers d where d.agence_id=c.agence_id and d.expire_le>clock_timestamp() and d.statut<>'expire'
 and (apres is null or d.reference collate "C">apres collate "C") order by d.reference collate "C" limit 51
 ), page as (select * from selection order by reference collate "C" limit 50)
 select jsonb_build_object('version',1,'dossiers',coalesce((select jsonb_agg(jsonb_build_object('reference',reference,'etat',etat) order by reference collate "C") from page),'[]'::jsonb),
 'suite',case when (select count(*) from selection)>50 then (select reference from page order by reference collate "C" desc limit 1) else null end) into resultat;
 return resultat;
end;$$;
revoke all on function public.creer_connecteur(text,text),public.revoquer_connecteur(uuid),public.lire_statuts_connecteur(text,text) from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
grant execute on function public.creer_connecteur(text,text),public.revoquer_connecteur(uuid) to authenticated;
grant execute on function public.lire_statuts_connecteur(text,text) to serveur;

-- Une readmission ulterieure ne doit jamais reactiver l'ancienne cle d'un exclu.
create function public.revoquer_connecteurs_du_membre() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.connecteurs_agence set revoque_le=coalesce(revoque_le,clock_timestamp())
 where agence_id=old.agence_id and cree_par=old.utilisateur_id;
 return old;
end;$$;
revoke all on function public.revoquer_connecteurs_du_membre() from public,anon,authenticated,porteur_lien,serveur,depot_piece,service_role;
create trigger revoquer_connecteurs_apres_exclusion after delete on public.membres_agence for each row execute function public.revoquer_connecteurs_du_membre();

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"b8880de1805c421d3dc85aa1aba92cf8927291b6780e27c2bb4d421716a5659e","indexes":"1feddd32b1badafb9ae9293587bdc0b89f8eaa08dcf33a96a8784b399630ce5b","colonnes":"860791de7bac52d319436310b57f8b567a223f9186162ec19e1f83d774b55dfa","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"d13d0649d8d0d728c1643697dbc2fe682f860b634e326bc4477bdc52fd8f5004","politiques":"5c46deeaaeb33e8128c9d82fe37137008626596013776101fe1ee9772cf45dd3","contraintes":"841a94cf1cd77f0f6824083d2cb430853e14be104557dfa3697e35bc6778dc8d","declencheurs":"9ede6a6dd675e8185855e2136283a161e76e88995bcbf1c0d83f29aafaa88350"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
