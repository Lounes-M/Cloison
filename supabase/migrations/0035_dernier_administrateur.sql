-- Les retraits d'administrateurs d'une agence sont serialises sur son parent.
create function public.conserver_administrateur()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'admin' and (
    tg_op = 'DELETE' or new.role <> 'admin' or new.agence_id is distinct from old.agence_id
  ) then
    -- Une ecriture identique force aussi un conflit de versions en isolation
    -- Repeatable Read, ou un simple verrou laisserait subsister un vieux compte.
    update public.agences set nom = nom where id = old.agence_id;
    -- La suppression administrative du parent peut poursuivre sa cascade.
    if found and not exists (
      select 1 from public.membres_agence
      where agence_id = old.agence_id and role = 'admin'
        and utilisateur_id <> old.utilisateur_id
    ) then
      raise exception 'Le dernier administrateur doit designer son successeur.'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.conserver_administrateur()
  from public, anon, authenticated, porteur_lien, serveur, depot_piece;

create trigger membre_conserve_administrateur
  before update or delete on public.membres_agence
  for each row execute function public.conserver_administrateur();
