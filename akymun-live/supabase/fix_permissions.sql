-- AKYMUN'26 — Supabase izin onarımı
-- Supabase Dashboard → SQL Editor → Run
-- Belirti: permission denied for function is_staff / table applications|staff_profiles|check_ins

begin;

-- Yardımcı fonksiyonlar (RLS politikaları bunları çağırıyor)
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as func_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_staff', 'staff_role')
  loop
    execute format(
      'grant execute on function %I.%I(%s) to anon, authenticated, service_role',
      r.schema_name, r.func_name, r.args
    );
  end loop;
end $$;

-- Uygulama RPC'leri
do $$
declare
  r record;
begin
  for r in
    select p.proname as func_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'lookup_application',
        'submit_application',
        'resolve_staff_email',
        'create_staff_user',
        'delete_staff_user',
        'get_participant_hub',
        'participant_check_in',
        'participant_save_note',
        'participant_set_session',
        'get_commission_chat',
        'send_commission_chat',
        'publish_site_banner'
      )
  loop
    execute format(
      'grant execute on function public.%I(%s) to anon, authenticated, service_role',
      r.func_name, r.args
    );
  end loop;
end $$;

-- Tablolar
grant select, update on table public.applications to authenticated;
grant select on table public.applications to anon;

grant select on table public.staff_profiles to authenticated;
grant select on table public.staff_profiles to anon;

grant select, insert, update, delete on table public.announcements to authenticated;
grant select on table public.announcements to anon;

grant select, insert, update, delete on table public.program_items to authenticated;
grant select on table public.program_items to anon;

grant select, insert, update, delete on table public.resources to authenticated;
grant select on table public.resources to anon;

grant select, insert, update, delete on table public.commission_rooms to authenticated;
grant select on table public.commission_rooms to anon;

grant select, update on table public.site_banner to authenticated;
grant select on table public.site_banner to anon;

grant select, insert on table public.check_ins to authenticated;
grant select, insert on table public.check_ins to anon;

-- sequences (varsa)
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('grant usage, select on sequence public.%I to anon, authenticated, service_role', r.relname);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
