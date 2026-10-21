-- Un collaborateur ne rejoint plus une agence existante sans l'accord d'un
-- administrateur.
--
-- Jusqu'ici, le domaine etait l'invitation (0002) : toute adresse confirmee
-- sur le domaine d'une agence la rejoignait aussitot et voyait tous ses
-- dossiers. C'est trop large des que l'agence est verifiee et traite de vraies
-- pieces : une boite creee pour un stagiaire, un alias, une franchise qui
-- partage le domaine de son reseau suffisaient a tout lire.
--
-- Le domaine reste la condition necessaire, il n'est plus suffisant. Le
-- premier arrive cree toujours son agence et l'administre, puisque l'agence
-- n'ouvre aucun dossier avant la verification de l'operateur (0012). Les
-- suivants deposent une demande ; un administrateur avec MFA l'accepte ou la
-- refuse. L'acceptation est consommee a la connexion suivante, comme la
-- readmission l'etait deja.
--
-- `rejoindre_ou_creer_agence` garde sa signature, donc ses droits. Elle rend
-- `null` tant que la demande attend : lever une exception annulerait
-- l'insertion de la demande elle-meme. Les membres deja rattaches ne sont pas
-- touches.

create table public.demandes_rattachement (
 utilisateur_id uuid primary key references auth.users(id) on delete cascade,
 agence_id uuid not null references public.agences(id) on delete cascade,
 demandee_le timestamptz not null default clock_timestamp(),
 approuvee_le timestamptz,
 approuvee_par uuid,
 check((approuvee_le is null) = (approuvee_par is null))
);
create index demandes_rattachement_agence on public.demandes_rattachement(agence_id,demandee_le,utilisateur_id);
alter table public.demandes_rattachement enable row level security;
revoke all on public.demandes_rattachement from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
-- Aucune politique : seules les fonctions ci-dessous la lisent et l'ecrivent.

alter table public.journal_administration_agence drop constraint journal_administration_agence_action_check;
alter table public.journal_administration_agence add constraint journal_administration_agence_action_check
 check(action in ('role','exclusion','readmission','approbation','refus'));

create or replace function public.rejoindre_ou_creer_agence(nom_souhaite text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  courriel    text;
  domaine_pro text;
  cible       uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select agence_id into cible from public.membres_agence where utilisateur_id = auth.uid();
  if found then
    return cible;
  end if;

  select email into courriel
    from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if not found then
    raise exception 'Adresse e-mail non confirmee.' using errcode = '42501';
  end if;

  domaine_pro := lower(btrim(split_part(courriel, '@', 2)));

  if exists (select 1 from public.domaines_grand_public d where d.domaine = domaine_pro) then
    raise exception 'Une adresse professionnelle est requise.' using errcode = '42501';
  end if;

  select id into cible from public.agences a where a.domaine = domaine_pro;

  if not found then
    if nom_souhaite is null or char_length(btrim(nom_souhaite)) < 2 then
      raise exception 'Le nom de l''agence est requis.' using errcode = '22023';
    end if;

    insert into public.agences (nom, domaine)
      values (btrim(nom_souhaite), domaine_pro)
      returning id into cible;

    insert into public.membres_agence (agence_id, utilisateur_id, role)
      values (cible, auth.uid(), 'admin');

    return cible;
  end if;

  -- Une personne exclue, ou une agence suspendue, ne peut pas meme deposer de
  -- demande : le refus est le meme que celui du declencheur de 0020.
  if exists (select 1 from public.exclusions_agence e
              where e.agence_id = cible and e.utilisateur_id = auth.uid())
     or exists (select 1 from public.agences a where a.id = cible and a.statut = 'suspendue') then
    raise exception 'Rattachement refuse.' using errcode = '42501';
  end if;

  -- Une demande vers une autre agence (adresse changee de domaine) repart de
  -- zero : une acceptation ne se transporte pas d'une agence a l'autre.
  insert into public.demandes_rattachement (utilisateur_id, agence_id)
    values (auth.uid(), cible)
  on conflict (utilisateur_id) do update
    set agence_id = excluded.agence_id, demandee_le = clock_timestamp(),
        approuvee_le = null, approuvee_par = null
    where public.demandes_rattachement.agence_id <> excluded.agence_id;

  if exists (select 1 from public.demandes_rattachement d
              where d.utilisateur_id = auth.uid() and d.agence_id = cible
                and d.approuvee_le is not null) then
    delete from public.demandes_rattachement where utilisateur_id = auth.uid();
    insert into public.membres_agence (agence_id, utilisateur_id, role)
      values (cible, auth.uid(), 'membre');
    return cible;
  end if;

  -- En attente d'un administrateur.
  return null;
end
$$;

comment on function public.rejoindre_ou_creer_agence(text) is
  'Cree l''agence du domaine pour le premier arrive. Pour les suivants, depose une demande et rend null tant qu''un administrateur ne l''a pas acceptee.';

-- La decision d'un administrateur. Accepter marque la demande ; la personne
-- rejoint a sa connexion suivante. Refuser la retire et pose une exclusion,
-- que la readmission sait lever.
create function public.decider_rattachement(le_demandeur uuid, accepter boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then
  raise exception 'Administration refusee' using errcode='42501';
 end if;
 if le_demandeur is null or accepter is null then
  raise exception 'Decision invalide' using errcode='22023';
 end if;
 if accepter then
  update public.demandes_rattachement d set approuvee_le=clock_timestamp(),approuvee_par=auth.uid()
   from auth.users u,public.agences a
   where d.utilisateur_id=le_demandeur and d.agence_id=agence and d.approuvee_le is null
    and u.id=le_demandeur and a.id=agence
    and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine;
  if not found then return false; end if;
  insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action)
   values(agence,auth.uid(),le_demandeur,'approbation');
 else
  delete from public.demandes_rattachement
   where utilisateur_id=le_demandeur and agence_id=agence and approuvee_le is null;
  if not found then return false; end if;
  insert into public.exclusions_agence(agence_id,utilisateur_id) values(agence,le_demandeur)
   on conflict do nothing;
  insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action)
   values(agence,auth.uid(),le_demandeur,'refus');
 end if;
 return true;
end;
$$;
revoke all on function public.decider_rattachement(uuid,boolean) from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.decider_rattachement(uuid,boolean) to authenticated;

-- La readmission vaut acceptation : sans cela, la personne qu'on vient
-- d'autoriser retomberait dans la file d'attente a sa connexion suivante.
create or replace function public.readmettre_collaborateur(cible uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then
  raise exception 'Administration refusee' using errcode='42501';
 end if;
 delete from public.exclusions_agence e using auth.users u,public.agences a
 where e.agence_id=agence and e.utilisateur_id=cible and u.id=cible and a.id=agence
  and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine;
 if not found then return false; end if;
 insert into public.demandes_rattachement(utilisateur_id,agence_id,approuvee_le,approuvee_par)
  values(cible,agence,clock_timestamp(),auth.uid())
 on conflict (utilisateur_id) do update
  set agence_id=excluded.agence_id,demandee_le=clock_timestamp(),
      approuvee_le=excluded.approuvee_le,approuvee_par=excluded.approuvee_par;
 insert into public.journal_administration_agence(agence_id,acteur_id,cible_id,action)
  values(agence,auth.uid(),cible,'readmission');
 return true;
end;
$$;

-- L'equipe affiche aussi les demandes : en attente, ou acceptees et pas
-- encore consommees. Meme signature, memes droits qu'en 0038.
create or replace function public.collaborateurs_agence(decalage integer default 0)
returns table(utilisateur_id uuid,email text,etat text,admissible boolean)
language plpgsql stable security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then
  raise exception 'Administration refusee' using errcode='42501';
 end if;
 if decalage is null or decalage<0 or decalage>499900 then raise exception 'Page invalide' using errcode='check_violation'; end if;
 return query
 with equipe as (
  select m.utilisateur_id,m.role as etat from public.membres_agence m where m.agence_id=agence
  union all
  select e.utilisateur_id,'exclu'::text from public.exclusions_agence e where e.agence_id=agence
  union all
  select d.utilisateur_id,case when d.approuvee_le is null then 'en_attente' else 'approuve' end
   from public.demandes_rattachement d where d.agence_id=agence
 )
 select e.utilisateur_id,
  case when lower(split_part(u.email,'@',2))=a.domaine then u.email::text else null end,
  e.etat,
  u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))=a.domaine
 from equipe e join auth.users u on u.id=e.utilisateur_id join public.agences a on a.id=agence
 order by (e.etat='en_attente') desc,e.utilisateur_id limit 51 offset decalage;
end;
$$;

-- Le nombre de demandes en attente, pour le signaler a l'administrateur sur
-- la liste des dossiers. Zero pour un membre simple : il n'a rien a decider.
create function public.rattachements_en_attente()
returns integer language plpgsql stable security definer set search_path='' as $$
declare agence uuid:=public.agence_courante();
begin
 if agence is null or not public.est_admin_agence() then return 0; end if;
 return (select count(*)::integer from public.demandes_rattachement d
          where d.agence_id=agence and d.approuvee_le is null);
end;
$$;
revoke all on function public.rattachements_en_attente() from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.rattachements_en_attente() to authenticated;

-- Fournisseurs d'adresses grand public absents de la liste de 0002. Une
-- adresse de ces domaines ne cree ni ne rejoint aucune agence.
insert into public.domaines_grand_public (domaine) values
  ('hotmail.be'), ('hotmail.co.uk'), ('hotmail.it'), ('hotmail.es'), ('hotmail.de'),
  ('outlook.be'), ('outlook.de'), ('outlook.es'), ('outlook.it'),
  ('live.be'), ('live.co.uk'), ('msn.com'), ('windowslive.com'),
  ('yahoo.co.uk'), ('yahoo.de'), ('yahoo.es'), ('yahoo.it'), ('ymail.com'), ('rocketmail.com'),
  ('gmx.com'), ('gmx.de'), ('gmx.net'), ('web.de'), ('mail.com'), ('email.com'),
  ('icloud.fr'), ('mac.com'), ('protonmail.ch'), ('pm.me'),
  ('tutanota.com'), ('tuta.io'), ('zoho.com'), ('yandex.com'), ('yandex.ru'),
  ('neuf.fr'), ('bbox.fr'), ('numericable.fr'), ('club-internet.fr'), ('aliceadsl.fr'),
  ('cegetel.net'), ('noos.fr'), ('voila.fr'), ('libertysurf.fr'), ('9online.fr'),
  ('skynet.be'), ('telenet.be'), ('bluewin.ch')
on conflict (domaine) do nothing;
