-- Les liens restent chiffres dans la file. Le bail evite les envois concurrents.
create table public.courriels_sortants (
  id uuid primary key,
  contenu text,
  cree_le timestamptz not null default now(),
  prochain_essai timestamptz not null default now(),
  premier_essai timestamptz,
  essais integer not null default 0,
  bail uuid,
  bail_expire_le timestamptz,
  envoye_le timestamptz,
  a_reconcilier boolean not null default false
);
alter table public.courriels_sortants enable row level security;
revoke all on public.courriels_sortants from public, anon, authenticated, porteur_lien, serveur;

create function public.mettre_courriel_en_file(identifiant uuid, chiffre text)
returns void language sql security definer set search_path='' as $$
  insert into public.courriels_sortants(id,contenu) values (identifiant,chiffre)
  on conflict(id) do nothing;
$$;

create function public.prendre_courriels(identifiant uuid default null)
returns table(id uuid,contenu text,bail uuid)
language plpgsql security definer set search_path='' as $$
begin
  -- Resend ne garantit l'idempotence que 24 h. Ne jamais rejouer une issue
  -- inconnue au-dela de cette fenetre : elle exige une reconciliation.
  update public.courriels_sortants c set a_reconcilier=true
  where c.envoye_le is null and c.premier_essai < now()-interval '23 hours';
  return query
  with disponibles as (
    select c.id from public.courriels_sortants c
    where c.envoye_le is null and not c.a_reconcilier
      and c.prochain_essai <= now()
      and (c.bail_expire_le is null or c.bail_expire_le < now())
      and (identifiant is null or c.id=identifiant)
    order by c.cree_le for update skip locked limit 10
  )
  update public.courriels_sortants c
  set bail=gen_random_uuid(),bail_expire_le=now()+interval '5 minutes',
      premier_essai=coalesce(c.premier_essai,now()),essais=c.essais+1
  from disponibles d where c.id=d.id returning c.id,c.contenu,c.bail;
end;
$$;

create function public.terminer_courriel(identifiant uuid, le_bail uuid, reussi boolean)
returns void language sql security definer set search_path='' as $$
  update public.courriels_sortants c
  set envoye_le=case when reussi then now() else null end,
      contenu=case when reussi then null else c.contenu end,
      bail=null,bail_expire_le=null,
      prochain_essai=now()+interval '5 minutes'
  where c.id=identifiant and c.bail=le_bail and c.envoye_le is null;
$$;
revoke all on function public.mettre_courriel_en_file(uuid,text),
  public.prendre_courriels(uuid),public.terminer_courriel(uuid,uuid,boolean)
  from public, anon, authenticated, porteur_lien;
grant execute on function public.mettre_courriel_en_file(uuid,text),
  public.prendre_courriels(uuid),public.terminer_courriel(uuid,uuid,boolean) to serveur;

create function public.etat_file_courriels()
returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
  -- Un lien de capacite expire en sept jours. Ne pas conserver son courriel
  -- indefiniment, meme lorsque l'operateur n'a pas encore reconcilie l'envoi.
  update public.courriels_sortants set contenu=null,a_reconcilier=true
    where envoye_le is null and cree_le < now()-interval '7 days' and contenu is not null;
  select count(*) into n from public.courriels_sortants where a_reconcilier;
  return n;
end;
$$;
revoke all on function public.etat_file_courriels() from public,anon,authenticated,porteur_lien;
grant execute on function public.etat_file_courriels() to serveur;
