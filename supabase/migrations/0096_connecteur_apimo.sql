-- Connecteur Apimo : ouvrir un dossier depuis un bien de l'agence et rendre
-- l'etat du dossier sur la fiche du bien.
--
-- L'ADR 0008 expose les statuts a qui vient les lire. Ici, c'est Cloison qui
-- appelle Apimo, avec les identifiants de l'agence et pour elle seule. Trois
-- regles tiennent en base :
--
-- 1. Sans identifiants, il n'y a rien. Aucune ligne dans `connexions_apimo`,
--    donc aucun acces rendu, aucun lien cree, aucun retour reserve.
-- 2. Le jeton n'est jamais lisible. La base ne recoit qu'un scelle, chiffre
--    cote serveur par la cle maitresse (ADR 0003) ; la colonne n'est ouverte a
--    aucun role, seules deux fonctions la rendent, a un membre de l'agence ou
--    au role serveur pour un retour deja du.
-- 3. Ce qui part chez Apimo est la projection de l'ADR 0008 : la reference du
--    dossier et son etat neutre. Aucun nom, courriel, montant ou piece.

create table public.connexions_apimo (
  agence_id uuid primary key references public.agences(id) on delete cascade,
  -- Identifiant du prestataire et de l'agence chez Apimo : des nombres.
  fournisseur text not null check (fournisseur ~ '^[0-9]{1,10}$'),
  agence_apimo text not null check (agence_apimo ~ '^[0-9]{1,10}$'),
  -- Base64 du scelle AES-256-GCM. Sans la cle maitresse, il ne dit rien.
  -- Ecrit sans `between` : melange a un autre `and`, il change de forme apres
  -- une sauvegarde et fausse la comparaison de restauration.
  jeton_scelle text not null check (char_length(jeton_scelle) >= 60
    and char_length(jeton_scelle) <= 1402 and jeton_scelle ~ '^[A-Za-z0-9+/]+={0,2}$'),
  -- L'agence choisit si l'etat du dossier est inscrit sur la fiche du bien.
  retour_statut boolean not null default false,
  configure_par uuid references auth.users(id) on delete set null,
  configure_le timestamptz not null default clock_timestamp(),
  verifie_le timestamptz,
  echec text check (echec in ('refus', 'limite', 'indisponible', 'reponse', 'secret')),
  echec_le timestamptz
);
alter table public.connexions_apimo enable row level security;
comment on table public.connexions_apimo is
  'Identifiants Apimo d''une agence. Le jeton est scelle hors de la base et ne se lit par aucun role.';

revoke all on public.connexions_apimo
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant select (agence_id, fournisseur, agence_apimo, retour_statut, configure_le, verifie_le, echec, echec_le)
  on public.connexions_apimo to authenticated;
create policy "Une agence lit l'etat de sa connexion Apimo"
  on public.connexions_apimo for select to authenticated
  using (agence_id = (select public.agence_courante()));

-- Un logement Cloison cree depuis un bien Apimo : le meme bien rend le meme
-- logement, pour que ses candidats se comparent (0069).
create table public.logements_apimo (
  logement_id uuid primary key references public.logements(id) on delete cascade,
  agence_id uuid not null references public.agences(id) on delete cascade,
  bien_apimo text not null check (bien_apimo ~ '^[0-9]{1,12}$'),
  unique (agence_id, bien_apimo)
);
alter table public.logements_apimo enable row level security;
revoke all on public.logements_apimo
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant select on public.logements_apimo to authenticated;
create policy "Une agence lit ses logements venus d'Apimo"
  on public.logements_apimo for select to authenticated
  using (agence_id = (select public.agence_courante()));

-- Le lien entre un dossier et sa fiche Apimo, et l'etat deja rendu.
create table public.liens_apimo (
  dossier_id uuid primary key references public.dossiers(id) on delete cascade,
  agence_id uuid not null references public.agences(id) on delete cascade,
  bien_apimo text not null check (bien_apimo ~ '^[0-9]{1,12}$'),
  -- Numero du bail tel que l'agence le lit dans Apimo. Un repere, pas un nom.
  bail_apimo text check (bail_apimo ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  cree_par uuid references auth.users(id) on delete set null,
  cree_le timestamptz not null default clock_timestamp(),
  etat_envoye text check (etat_envoye in ('a_completer', 'pret', 'en_cours', 'signe', 'clos')),
  envoye_le timestamptz,
  etat_tente text check (etat_tente in ('a_completer', 'pret', 'en_cours', 'signe', 'clos')),
  tentatives integer not null default 0 check (tentatives between 0 and 100),
  -- Vrai tant qu'un envoi reserve n'a pas rendu de reponse nette : une ecriture
  -- dont l'issue est inconnue ne se rejoue pas.
  incertain boolean not null default false,
  prochaine_tentative timestamptz not null default clock_timestamp()
);
create index liens_apimo_a_rendre on public.liens_apimo(prochaine_tentative);
create index liens_apimo_agence on public.liens_apimo(agence_id);
alter table public.liens_apimo enable row level security;
comment on table public.liens_apimo is
  'Dossier ouvert depuis un bien ou un bail Apimo. Identifiants de fiche seulement, aucune donnee de personne.';
revoke all on public.liens_apimo
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant select (dossier_id, agence_id, bien_apimo, bail_apimo, cree_le, etat_envoye, envoye_le)
  on public.liens_apimo to authenticated;
create policy "Une agence lit les liens Apimo de ses dossiers"
  on public.liens_apimo for select to authenticated
  using (agence_id = (select public.agence_courante()));

-- L'etat neutre de l'ADR 0008, au mot pres. Un dossier expire est clos.
create function public.etat_retour_apimo(le_statut text) returns text
language sql immutable set search_path='' as $$
  select case le_statut when 'complet' then 'pret' when 'transmis' then 'en_cours'
    when 'signe' then 'signe' when 'refuse' then 'clos' when 'expire' then 'clos'
    else 'a_completer' end;
$$;

-- Un administrateur enregistre ou remplace les identifiants de son agence.
-- Le scelle arrive deja chiffre : la base ne voit jamais le jeton.
create function public.configurer_apimo(le_fournisseur text, l_agence_apimo text,
  le_jeton_scelle text, le_retour boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
 v_fenetre timestamptz := date_bin(interval '1 day',clock_timestamp(),timestamptz 'epoch');
 atteint integer;
begin
 if agence is null or le_retour is null
 or le_fournisseur is null or le_fournisseur !~ '^[0-9]{1,10}$'
 or l_agence_apimo is null or l_agence_apimo !~ '^[0-9]{1,10}$'
 or le_jeton_scelle is null or char_length(le_jeton_scelle) not between 60 and 1402
 or le_jeton_scelle !~ '^[A-Za-z0-9+/]+={0,2}$' then
  return false;
 end if;
 -- Serialise avec l'exclusion : un administrateur retire ne configure plus.
 perform 1 from public.membres_agence
  where agence_id=agence and utilisateur_id=auth.uid() and role='admin' for update;
 if not found then return false; end if;
 delete from public.debits where cle like 'apimo:configuration:%' and fenetre<v_fenetre;
 insert into public.debits(cle,fenetre,compte) values('apimo:configuration:'||agence::text,v_fenetre,1)
 on conflict(cle,fenetre) do update set compte=public.debits.compte+1 returning compte into atteint;
 if atteint>20 then return false; end if;
 insert into public.connexions_apimo(agence_id,fournisseur,agence_apimo,jeton_scelle,retour_statut,
  configure_par,configure_le,verifie_le,echec,echec_le)
 values(agence,le_fournisseur,l_agence_apimo,le_jeton_scelle,le_retour,auth.uid(),
  clock_timestamp(),clock_timestamp(),null,null)
 on conflict(agence_id) do update set fournisseur=excluded.fournisseur,
  agence_apimo=excluded.agence_apimo,jeton_scelle=excluded.jeton_scelle,
  retour_statut=excluded.retour_statut,configure_par=excluded.configure_par,
  configure_le=excluded.configure_le,verifie_le=excluded.verifie_le,echec=null,echec_le=null;
 return true;
end;$$;

-- Le choix du retour d'etat se change sans ressaisir le jeton.
create function public.regler_retour_apimo(le_retour boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
begin
 if agence is null or le_retour is null or not exists(select 1 from public.membres_agence
  where agence_id=agence and utilisateur_id=auth.uid() and role='admin') then return false; end if;
 update public.connexions_apimo set retour_statut=le_retour where agence_id=agence;
 return found;
end;$$;

-- Retirer les identifiants coupe tout : lectures, ouvertures et retours. Les
-- liens deja crees restent sur les dossiers, sans plus rien envoyer.
create function public.retirer_apimo() returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
begin
 if agence is null or not exists(select 1 from public.membres_agence
  where agence_id=agence and utilisateur_id=auth.uid() and role='admin') then return false; end if;
 delete from public.connexions_apimo where agence_id=agence;
 return found;
end;$$;

-- Ce qu'il faut pour appeler Apimo au nom de l'agence : rendu a un membre,
-- compte a chaque fois. Soixante lectures par dix minutes et par agence.
create function public.acces_apimo() returns jsonb
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante(); c public.connexions_apimo; atteint integer;
 v_fenetre timestamptz := date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch');
begin
 if agence is null or auth.uid() is null then return null; end if;
 select * into c from public.connexions_apimo where agence_id=agence;
 if not found then return null; end if;
 delete from public.debits where cle like 'apimo:lecture:%' and fenetre<v_fenetre;
 insert into public.debits(cle,fenetre,compte) values('apimo:lecture:'||agence::text,v_fenetre,1)
 on conflict(cle,fenetre) do update set compte=public.debits.compte+1 returning compte into atteint;
 if atteint>60 then return jsonb_build_object('limite',true); end if;
 return jsonb_build_object('agence',c.agence_id,'fournisseur',c.fournisseur,
  'agence_apimo',c.agence_apimo,'jeton_scelle',c.jeton_scelle);
end;$$;

-- Le dernier resultat d'un appel, pour que l'ecran dise ce qui ne va pas.
create function public.noter_apimo(le_resultat text) returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
begin
 if agence is null or le_resultat is null
 or le_resultat not in ('ok','refus','limite','indisponible','reponse','secret') then return false; end if;
 if le_resultat='ok' then
  update public.connexions_apimo set verifie_le=clock_timestamp(),echec=null,echec_le=null
   where agence_id=agence;
 else
  update public.connexions_apimo set echec=le_resultat,echec_le=clock_timestamp()
   where agence_id=agence;
 end if;
 return found;
end;$$;

-- Le logement Cloison d'un bien Apimo : celui qui existe, sinon un nouveau.
-- Un logement deja cree n'est pas reecrit : l'agence a pu corriger son libelle.
create function public.logement_du_bien_apimo(le_bien text, le_libelle text, le_loyer_cents bigint)
returns uuid
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante(); resultat uuid;
begin
 if agence is null or le_bien is null or le_bien !~ '^[0-9]{1,12}$'
 or le_libelle is null or length(btrim(le_libelle)) not between 1 and 120
 or (le_loyer_cents is not null and (le_loyer_cents<=0 or le_loyer_cents>10000000))
 or not exists(select 1 from public.connexions_apimo where agence_id=agence) then return null; end if;
 -- Deux ouvertures simultanees du meme bien ne creent qu'un logement.
 perform pg_advisory_xact_lock(hashtextextended('apimo:'||agence::text||':'||le_bien,7096001));
 select logement_id into resultat from public.logements_apimo
  where agence_id=agence and bien_apimo=le_bien;
 if resultat is not null then return resultat; end if;
 insert into public.logements(agence_id,libelle,loyer_cents)
  values(agence,btrim(le_libelle),le_loyer_cents) returning id into resultat;
 insert into public.logements_apimo(logement_id,agence_id,bien_apimo) values(resultat,agence,le_bien);
 return resultat;
end;$$;

-- Relier un dossier de l'agence a sa fiche Apimo. Une seule fois par dossier,
-- jamais sur le dossier d'un second garant ni sur une demonstration.
create function public.lier_dossier_apimo(le_dossier uuid, le_bien text, le_bail text)
returns boolean
language plpgsql security definer set search_path='' as $$
declare agence uuid := public.agence_courante();
begin
 if agence is null or le_dossier is null or le_bien is null or le_bien !~ '^[0-9]{1,12}$'
 or (le_bail is not null and le_bail !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$')
 or not exists(select 1 from public.connexions_apimo where agence_id=agence)
 or not exists(select 1 from public.dossiers d where d.id=le_dossier and d.agence_id=agence
  and d.dossier_principal is null and not d.demonstration
  and d.expire_le>clock_timestamp() and d.statut<>'expire') then return false; end if;
 insert into public.liens_apimo(dossier_id,agence_id,bien_apimo,bail_apimo,cree_par)
  values(le_dossier,agence,le_bien,le_bail,auth.uid()) on conflict(dossier_id) do nothing;
 return found;
end;$$;

-- Les retours dus, pour le role serveur seulement. La reservation marque
-- l'envoi incertain avant qu'il parte : si le serveur tombe en route, l'etat
-- n'est pas renvoye a l'aveugle. Un refus net se retente, six fois au plus,
-- avec un delai qui double. Un nouvel etat du dossier repart de zero.
create function public.reserver_retours_apimo(combien integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resultat jsonb;
begin
 if combien is null or combien not between 1 and 50 then return '[]'::jsonb; end if;
 with dus as (
  select l.dossier_id, d.reference, public.etat_retour_apimo(d.statut::text) as etat,
   l.bien_apimo, l.bail_apimo, l.etat_tente, l.tentatives,
   c.agence_id, c.fournisseur, c.agence_apimo, c.jeton_scelle
  from public.liens_apimo l
  join public.dossiers d on d.id=l.dossier_id and d.agence_id=l.agence_id
  join public.connexions_apimo c on c.agence_id=l.agence_id
  join public.agences a on a.id=l.agence_id
  where c.retour_statut and a.statut<>'suspendue' and not d.demonstration
   and l.prochaine_tentative<=clock_timestamp()
   and public.etat_retour_apimo(d.statut::text) is distinct from l.etat_envoye
   and not (l.etat_tente is not distinct from public.etat_retour_apimo(d.statut::text)
            and (l.incertain or l.tentatives>=6))
  order by l.prochaine_tentative, l.dossier_id
  limit combien
  for update of l skip locked
 ), reserves as (
  update public.liens_apimo l set
   etat_tente=dus.etat,
   tentatives=case when l.etat_tente is distinct from dus.etat then 1 else l.tentatives+1 end,
   incertain=true,
   prochaine_tentative=clock_timestamp()+interval '15 minutes'
    *power(2,case when l.etat_tente is distinct from dus.etat then 0 else least(l.tentatives,6) end)
  from dus where l.dossier_id=dus.dossier_id
  returning dus.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('dossier',dossier_id,'reference',reference,
  'etat',etat,'bien',bien_apimo,'bail',bail_apimo,'agence',agence_id,'fournisseur',fournisseur,
  'agence_apimo',agence_apimo,'jeton_scelle',jeton_scelle) order by dossier_id),'[]'::jsonb)
 into resultat from reserves;
 return resultat;
end;$$;

-- L'issue d'un retour reserve. `envoye` l'inscrit ; `refuse` rend la main au
-- prochain cycle ; `incertain` laisse l'etat en suspens, sans rejeu.
create function public.confirmer_retour_apimo(le_dossier uuid, l_etat text, l_issue text)
returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if le_dossier is null or l_etat is null or l_issue is null
 or l_issue not in ('envoye','refuse','incertain') then return false; end if;
 update public.liens_apimo set
  etat_envoye=case when l_issue='envoye' then l_etat else etat_envoye end,
  envoye_le=case when l_issue='envoye' then clock_timestamp() else envoye_le end,
  incertain=(l_issue='incertain')
 where dossier_id=le_dossier and etat_tente=l_etat and incertain;
 return found;
end;$$;

revoke all on function public.etat_retour_apimo(text),
 public.configurer_apimo(text,text,text,boolean),public.regler_retour_apimo(boolean),
 public.retirer_apimo(),public.acces_apimo(),public.noter_apimo(text),
 public.logement_du_bien_apimo(text,text,bigint),public.lier_dossier_apimo(uuid,text,text),
 public.reserver_retours_apimo(integer),public.confirmer_retour_apimo(uuid,text,text)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.configurer_apimo(text,text,text,boolean),
 public.regler_retour_apimo(boolean),public.retirer_apimo(),public.acces_apimo(),
 public.noter_apimo(text),public.logement_du_bien_apimo(text,text,bigint),
 public.lier_dossier_apimo(uuid,text,text) to authenticated;
grant execute on function public.reserver_retours_apimo(integer),
 public.confirmer_retour_apimo(uuid,text,text) to serveur;
