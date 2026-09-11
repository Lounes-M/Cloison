-- A executer sous transaction annulee, apres la fixture responsables.
-- Cette fixture ne prepare aucun contenu de courriel et n'appelle aucun fournisseur.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.responsable_admin'),'aal','aal2')::text,true);
set local role authenticated;
do $preferences$ declare r uuid;refuse boolean:=false;begin
 if (select mode from public.mes_preferences_notifications())<>'tous' then raise exception 'Preference initiale incorrecte';end if;
 r:=public.regler_notifications('aucun');
 if r is null then raise exception 'Preference refusee';end if;
 if public.regler_notifications('mes') is not null then raise exception 'Revision obsolete acceptee';end if;
 if (select mode from public.mes_preferences_notifications())<>'aucun' then raise exception 'Preference non conservee';end if;
 begin update public.preferences_notifications set mode='tous';exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Preference modifiable directement';end if;
end $preferences$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('cloison.responsable_second'),'aal','aal2')::text,true);
set local role authenticated;
do $confidentialite$ begin
 if exists(select 1 from public.preferences_notifications) then raise exception 'Preference tierce visible';end if;
 if (select mode from public.mes_preferences_notifications())<>'tous' then raise exception 'Preference tierce appliquee';end if;
end $confidentialite$;
reset role;
do $roles$ declare r text;refuse boolean;begin
 foreach r in array array['anon','porteur_lien','serveur','depot_piece','service_role'] loop
 execute format('set local role %I',r);refuse:=false;
 begin perform public.regler_notifications('aucun');exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Preference ouverte';end if;
 refuse:=false;
 begin perform * from public.mes_preferences_notifications();exception when insufficient_privilege then refuse:=true;end;
 if not refuse then raise exception 'Lecture preferences ouverte';end if;
 reset role;
 end loop;
end $roles$;
