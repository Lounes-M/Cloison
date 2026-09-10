begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"abbf5bba3e794135e141769f370eb19cbbfd3ffc08d0324e912a84c0e9da2aba","indexes":"6f4353f67be2147cc1ad2fc95c5c681f9a7329fd9bb8a9207832829b8048d367","colonnes":"1a63c23a07ac3fb7f67ab4760ef5ba68de2d02c60c884115cf1d272ca1924a16","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"72844d2785b655575b7aa7f65197c5e3f5354ef16b8ccec9f9693b3a9fc96c44","politiques":"7021234319bdc7b6269ab2b220a8d50f636651938b05f46ba6a41a425fa00bb9","contraintes":"caf581fbb5aa3a7b65ec91f7925a627acee2161d0a6b6179982a096b8a9cb330","declencheurs":"ea4e2faff47891b42dc8860a4dfa1f1e03e1b1d53bfd57a84afb50367bbc3217"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
-- Journal administratif : aucune decision ne modifie le registre financier.
create table public.decisions_paiements (
  operation uuid primary key,
  operateur uuid not null,
  reference_session text not null check (reference_session ~ '^cs_[A-Za-z0-9_]{1,196}$'),
  decision text not null check (decision in ('a_examiner','a_corriger','justifie','corrige')),
  rapport_sha256 text not null check (rapport_sha256 ~ '^[a-f0-9]{64}$'),
  rapport_observe_le timestamptz not null,
  compte_base name not null default session_user,
  inscrit_le timestamptz not null default clock_timestamp()
);
create index decisions_paiements_session on public.decisions_paiements(reference_session,inscrit_le,operation);
alter table public.decisions_paiements enable row level security;
revoke all on public.decisions_paiements from public,anon,authenticated,service_role,porteur_lien,serveur,depot_piece;

create function public.proteger_decision_paiement() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Decision administrative immuable'; end if;
  if new.rapport_observe_le < '1970-01-01'::timestamptz
    or new.rapport_observe_le > clock_timestamp()+interval '5 minutes'
    or not isfinite(new.rapport_observe_le) then
    raise exception 'Date de diagnostic invalide';
  end if;
  if not exists(select 1 from public.sessions_paiement where session_ref=new.reference_session)
    and not exists(select 1 from public.registre_paiements where reference_session=new.reference_session)
    and not exists(select 1 from public.rapprochements_paiements where reference_session=new.reference_session)
    and not exists(select 1 from public.evenements_paiements where reference_session=new.reference_session or reference_objet=new.reference_session)
    and not exists(select 1 from public.decisions_paiements where reference_session=new.reference_session) then
    raise exception 'Session administrative inconnue';
  end if;
  new.compte_base := session_user;
  new.inscrit_le := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.proteger_decision_paiement() from public,anon,authenticated,service_role,porteur_lien,serveur,depot_piece;
create trigger decisions_paiements_immuables before insert or update or delete on public.decisions_paiements
for each row execute function public.proteger_decision_paiement();

do $controle$ begin if public.empreinte_schema() <> '{"version":1,"empreintes":{"roles":"cbf8d0c121b9acdc52e9296b48d68997b5bab79fcf8cd6a0f7c9c89218d4bb9a","bucket":"df5651bc40713202bd865db07e8d6b9046377b65ccea7611c273e6782d99753b","schema":"1882b23bb08a24644785aaa9be96482bd0651cfe68eef70370021fc878850bef","tables":"679e120c3a8474b7093e3f84ef1421c9f6c00afbb25b0b4b7124e98ef1f45a08","indexes":"ab4ce0d9439ec702d1656ca0bd347ea1b81a0411f9c861a92c72c548a32870d2","colonnes":"40a55e9b7413cd8ae4d3d7bdd34a2e6e80d659d224c8dfa4db5c12d3890a2175","stockage":"c40beef08b4b6b283f5736362f2144d3d248dbebf1b130576cc11dd9b3fd772c","adhesions":"1124721a05747b8418dfcb343f00bf1abdb602fd1c0ed965ad8bae8da8c6de13","fonctions":"1efadd14d1e7e48471d345193eed560abfdf9a2eec2de18a13eaaaddb9babb86","politiques":"7021234319bdc7b6269ab2b220a8d50f636651938b05f46ba6a41a425fa00bb9","contraintes":"df0eee1234bdf1d3836a85042138c2c66e62410866088d3bde282e5e6b9a8716","declencheurs":"67edf64125e3562a56a68a6163a9ff878f626a133b7ee1096be0d2442c1069a1"}}'::jsonb then raise exception 'Schema inattendu : interrompre et examiner';end if;end $controle$;
commit;
