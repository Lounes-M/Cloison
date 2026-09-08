-- Une mention appartient aux conditions que le garant a vues.
alter table public.engagements
  add column version_conditions integer not null default 1
  check (version_conditions > 0);

create function public.versionner_conditions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- Le grant INSERT historique porte sur la table entiere.
    new.version_conditions := 1;
  elsif row(new.couvre, new.montant_max_cents, new.jusqu_au, new.solidaire)
        is distinct from row(old.couvre, old.montant_max_cents, old.jusqu_au, old.solidaire) then
    new.version_conditions := old.version_conditions + 1;
    new.mention := null;
    new.mention_saisie_le := null;
  else
    new.version_conditions := old.version_conditions;
  end if;
  return new;
end;
$$;
revoke all on function public.versionner_conditions()
  from public, anon, authenticated, porteur_lien, serveur, depot_piece;

create trigger engagement_conditions_versionnees
  before insert or update on public.engagements
  for each row execute function public.versionner_conditions();

comment on column public.engagements.version_conditions is
  'Version des conditions financieres et de solidarite ; invalide la mention lors d un changement.';
