-- Comparaison du revenu declare aux justificatifs, a la demande de l'agence.
--
-- Le garant declare un revenu net mensuel ; ses bulletins de paie et son
-- attestation de pension en sont la preuve. Sur demande explicite, une IA lit
-- sur ces pieces le mois et le montant net paye, Cloison refait le calcul de
-- la proposition faite au garant (0088) et l'agence voit l'ecart avec la
-- declaration. Rien n'est enregistre : ni montant lu, ni ecart, ni statut. La
-- decision reste humaine (ADR 0007).
--
-- Une seule reservation pour tout le dossier, avant toute lecture du coffre :
-- elle verifie l'agence et l'etat du dossier, exige un revenu declare, choisit
-- elle-meme les pieces (deux natures de revenus seulement, quatre au plus, les
-- plus recentes, jamais une piece ecartee par un complement), consomme le
-- quota et inscrit une ligne au journal par piece. Tout ou rien : un quota
-- atteint n'envoie aucune piece. La piece d'identite, le justificatif de
-- domicile et l'avis d'imposition ne peuvent pas partir par ce chemin.

-- L'action s'ajoute a la liste en place, quelle qu'elle soit : plusieurs
-- migrations etendent ce journal en parallele et aucune ne doit effacer
-- l'action d'une autre.
do $ajout$
declare actions text[];
begin
 select array_agg(m[1] order by ordre) into actions
 from regexp_matches(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid='public.journal_acces'::regclass and conname='journal_acces_action_check'),
  '''([a-z0-9_]+)''','g') with ordinality as t(m,ordre);
 if actions is null or cardinality(actions)<10 then
  raise exception 'Liste des actions du journal illisible : interrompre et examiner';
 end if;
 if not ('comparaison_revenus'=any(actions)) then
  actions:=actions||'comparaison_revenus'::text;
 end if;
 alter table public.journal_acces drop constraint journal_acces_action_check;
 execute format('alter table public.journal_acces add constraint journal_acces_action_check check(action in (%s))',
  (select string_agg(quote_literal(a),',' order by o) from unnest(actions) with ordinality as u(a,o)));
end $ajout$;

create function public.reserver_comparaison_revenus(le_dossier uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 d public.dossiers; declare_cents bigint; lues uuid[]; nombre integer;
 sujet text; limite integer; atteint integer;
 qui uuid := auth.uid();
 v_fenetre timestamptz := date_bin(interval '10 minutes',clock_timestamp(),timestamptz 'epoch');
begin
 if le_dossier is null or qui is null or public.agence_courante() is null then return null; end if;
 select * into d from public.dossiers x
  where x.id=le_dossier and x.agence_id=public.agence_courante()
  -- Avant un premier dossier complet, l'agence ne lit aucune piece (0087).
  and (x.complet_le is not null or x.demonstration)
  and x.expire_le>clock_timestamp() and x.statut<>'expire';
 if not found then return null; end if;

 -- Sans declaration, il n'y a rien a comparer : aucune piece ne part.
 select e.revenu_net_mensuel_cents into declare_cents
  from public.engagements e where e.dossier_id=d.id;
 if declare_cents is null or declare_cents<=0 then return null; end if;

 select array_agg(s.id order by s.depose_le desc,s.id) into lues from (
  select p.id,p.depose_le from public.pieces p
  where p.dossier_id=d.id and p.type in ('bulletin_paie','pension_retraite')
  and not exists(select 1 from public.complements_documentaires c
   where c.dossier_id=d.id and p.id=any(c.pieces_ecartees))
  order by p.depose_le desc,p.id limit 4) s;
 nombre := coalesce(cardinality(lues),0);
 if nombre=0 then return null; end if;

 -- Meme verrou et meme budget global que les autres lectures par IA (0047,
 -- 0088). Chaque piece compte : une comparaison de quatre pieces en vaut quatre.
 perform pg_advisory_xact_lock(7047001);
 delete from public.debits where cle like 'ocr:%' and debits.fenetre<v_fenetre;
 for sujet,limite in select * from (values
 ('ocr:comparaison:acteur:'||qui::text,12),
 ('ocr:comparaison:agence:'||d.agence_id::text,40),
 ('ocr:global:partage',100)) x(s,l)
 loop
   insert into public.debits(cle,fenetre,compte) values(sujet,v_fenetre,nombre)
   on conflict(cle,fenetre) do update set compte=public.debits.compte+nombre returning compte into atteint;
   if atteint>limite then return null; end if;
 end loop;

 insert into public.journal_acces(dossier_id,acteur,acteur_id,action,piece_id)
 select d.id,'agence',qui,'comparaison_revenus',x from unnest(lues) x;

 return jsonb_build_object('declare_cents',declare_cents,'pieces',to_jsonb(lues));
end;
$$;
comment on function public.reserver_comparaison_revenus(uuid) is
 'Reserve et journalise la comparaison du revenu declare aux pieces. Rend la declaration et les pieces a lire, ou null.';
revoke all on function public.reserver_comparaison_revenus(uuid)
 from public,anon,authenticated,porteur_lien,serveur,depot_piece,archive_signature,service_role;
grant execute on function public.reserver_comparaison_revenus(uuid) to authenticated;
