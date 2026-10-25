-- Run once in the Supabase SQL Editor. No service key belongs in this repository.
begin;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from anon, authenticated;
grant select on public.site_admins to authenticated;
create policy "Admins can check their own membership" on public.site_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.site_content (
  id text primary key check (id = 'main'),
  document jsonb not null check (jsonb_typeof(document) = 'object' and (document->>'schemaVersion')::int = 1 and jsonb_typeof(document->'text') = 'object' and jsonb_typeof(document->'settings') = 'object'),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant update (document, revision) on public.site_content to authenticated;
create policy "Anyone can read published website content" on public.site_content
  for select to anon, authenticated using (true);
create policy "Only approved administrators can publish" on public.site_content
  for update to authenticated
  using (exists (select 1 from public.site_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.site_admins where user_id = (select auth.uid())));

create table if not exists public.content_history (
  id bigint generated always as identity primary key,
  document jsonb not null,
  revision integer not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users(id) on delete set null
);
alter table public.content_history enable row level security;
revoke all on public.content_history from anon, authenticated;
grant select on public.content_history to authenticated;
create policy "Admins can read content history" on public.content_history
  for select to authenticated using (exists (select 1 from public.site_admins where user_id = (select auth.uid())));

create or replace function public.version_website_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Revision must increase by exactly one';
  end if;
  if octet_length(new.document::text) > 300000 then
    raise exception 'Website content exceeds the size limit';
  end if;
  insert into public.content_history(document, revision, saved_by)
    values (old.document, old.revision, old.updated_by);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.version_website_content() from public;
create trigger version_website_content before update on public.site_content
  for each row execute function public.version_website_content();

insert into public.site_content(id, document) values
  ('main', '{"schemaVersion":1,"text":{},"settings":{}}'::jsonb)
  on conflict (id) do nothing;
commit;

-- AFTER creating your login in Authentication > Users, run this separately:
-- insert into public.site_admins(user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
