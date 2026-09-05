-- Le garant voit uniquement les acces de son dossier, avec l'identite
-- professionnelle de l'agence lorsqu'elle est encore disponible.
create function public.mon_journal_acces()
returns table(id uuid, action text, acteur text, identite text, quand timestamptz)
language sql stable security definer set search_path='' as $$
  select j.id,j.action,j.acteur,u.email,j.quand
  from public.journal_acces j left join auth.users u on u.id=j.acteur_id
  where public.partie_courante()='garant' and j.dossier_id=public.dossier_courant()
  order by j.quand desc,j.id limit 100;
$$;
revoke all on function public.mon_journal_acces() from public, anon, authenticated;
grant execute on function public.mon_journal_acces() to porteur_lien;
