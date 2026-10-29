-- L'activite de l'agence, mois par mois, sans garder un seul dossier.
--
-- Les dossiers partent a la purge (ADR 0003) : compter ce qui existe encore ne
-- dirait rien de l'annee ecoulee. Ce registre ne garde que des compteurs par
-- agence et par mois, incrementes au moment ou un dossier change d'etat.
-- Aucune reference, aucune adresse, aucun montant : un compteur ne permet pas
-- de retrouver un dossier, et il survit donc legitimement a la purge.
--
-- Ce qui est compte, une fois par dossier et par evenement :
--   - ouverts : le dossier entre dans l'agence (creation, ou rattachement
--     d'un dossier ouvert par le locataire) ;
--   - pris, refuses, signes : la decision ou la signature ;
--   - clos : la cloture anticipee de la 0066 ;
--   - le delai de prise, cumule en secondes, pour une moyenne sans dossier.
-- Les dossiers de demonstration et ceux d'un second garant (0067) ne comptent
-- pas : le second garant n'est pas un nouveau candidat.

create table public.activite_agence (
  agence_id uuid not null references public.agences(id) on delete cascade,
  mois date not null check (mois = date_trunc('month', mois)::date),
  ouverts integer not null default 0 check (ouverts >= 0),
  pris integer not null default 0 check (pris >= 0),
  refuses integer not null default 0 check (refuses >= 0),
  signes integer not null default 0 check (signes >= 0),
  clos integer not null default 0 check (clos >= 0),
  delai_prise_secondes bigint not null default 0 check (delai_prise_secondes >= 0),
  primary key (agence_id, mois)
);
alter table public.activite_agence enable row level security;
revoke all on public.activite_agence
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;

comment on table public.activite_agence is
  'Compteurs mensuels par agence. Aucune donnee de dossier : ils survivent a la purge.';

create function public.compter_activite() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  l_agence uuid := new.agence_id;
  le_mois date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  o integer := 0; p integer := 0; r integer := 0; s integer := 0; c integer := 0;
  delai bigint := 0;
begin
  if l_agence is null or new.demonstration or new.dossier_principal is not null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    o := 1;
  else
    if old.agence_id is null then o := 1; end if;
    if new.statut is distinct from old.statut then
      if new.statut = 'transmis' then
        p := 1;
        delai := greatest(0, extract(epoch from now() - new.cree_le))::bigint;
      elsif new.statut = 'refuse' then
        r := 1;
      elsif new.statut = 'signe' then
        s := 1;
      elsif new.statut = 'expire' and new.expire_le <= now() and old.expire_le > now() then
        -- La 0066 avance l'echeance dans le meme geste ; une expiration
        -- naturelle ne passe pas par ici, la purge supprime sans changer de
        -- statut.
        c := 1;
      end if;
    end if;
  end if;
  if o + p + r + s + c = 0 then
    return new;
  end if;
  insert into public.activite_agence as a(agence_id, mois, ouverts, pris, refuses, signes, clos,
    delai_prise_secondes)
  values (l_agence, le_mois, o, p, r, s, c, delai)
  on conflict (agence_id, mois) do update set
    ouverts = a.ouverts + excluded.ouverts,
    pris = a.pris + excluded.pris,
    refuses = a.refuses + excluded.refuses,
    signes = a.signes + excluded.signes,
    clos = a.clos + excluded.clos,
    delai_prise_secondes = a.delai_prise_secondes + excluded.delai_prise_secondes;
  return new;
end;
$$;
revoke all on function public.compter_activite()
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
create trigger activite_a_la_creation after insert on public.dossiers
for each row execute function public.compter_activite();
create trigger activite_au_changement after update of statut, agence_id on public.dossiers
for each row execute function public.compter_activite();

-- Ce que l'agence lit : ses douze derniers mois, plus les dossiers en cours.
-- Lecture en aal2 comme le reste de l'espace ; tout membre y a acces, les
-- compteurs ne designent personne.
create function public.activite_de_mon_agence()
returns table(mois date, ouverts integer, pris integer, refuses integer, signes integer,
  clos integer, delai_prise_moyen_jours numeric)
language sql stable security definer set search_path='' as $$
  with bornes as (
    select public.agence_courante() as agence,
      date_trunc('month', now() at time zone 'Europe/Paris')::date as courant
  ), mois as (
    select (b.courant - make_interval(months => n))::date as mois, b.agence
      from bornes b, generate_series(0, 11) n
     where b.agence is not null
  )
  select m.mois, coalesce(a.ouverts, 0), coalesce(a.pris, 0), coalesce(a.refuses, 0),
    coalesce(a.signes, 0), coalesce(a.clos, 0),
    case when coalesce(a.pris, 0) > 0
      then round(a.delai_prise_secondes::numeric / a.pris / 86400, 1) end
    from mois m
    left join public.activite_agence a on a.agence_id = m.agence and a.mois = m.mois
   order by m.mois desc;
$$;
revoke all on function public.activite_de_mon_agence()
 from public,anon,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.activite_de_mon_agence() to authenticated;
