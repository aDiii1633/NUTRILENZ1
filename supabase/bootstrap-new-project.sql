-- NEW PROJECT ONLY. Run once in Supabase SQL Editor.
-- Generated from schema.sql, offer-submissions.sql and image-verification.sql.
-- One transaction: failures roll back the entire setup.
begin;

-- Source: schema.sql
-- Run once in the Supabase SQL Editor. No service key belongs in this repository.

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

-- AFTER creating your login in Authentication > Users, run this separately:
-- insert into public.site_admins(user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';

-- Source: offer-submissions.sql
-- Run AFTER schema.sql, in the SAME Supabase project used by the website/admin.

create table public.offer_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  participant_name text not null check (length(participant_name) between 2 and 100),
  email text, -- Legacy field; new submissions do not collect or store email.
  loomii_username text not null check (length(loomii_username) between 2 and 80),
  screenshot_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text not null default '' check (length(review_note) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  attempts integer not null default 1 check (attempts between 1 and 5),
  consent_version text not null default 'offer-verification-v1'
);
create index offer_submissions_status_date on public.offer_submissions(status,submitted_at desc);
alter table public.offer_submissions enable row level security;
revoke all on public.offer_submissions from anon, authenticated;
grant select on public.offer_submissions to authenticated;
create policy "Participants and admins read submissions" on public.offer_submissions for select to authenticated
using (user_id = (select auth.uid()) or exists(select 1 from public.site_admins where user_id = (select auth.uid())));

create table public.offer_submission_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.offer_submissions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null,
  note text not null default '',
  screenshot_path text,
  created_at timestamptz not null default now()
);
alter table public.offer_submission_events enable row level security;
revoke all on public.offer_submission_events from anon, authenticated;
grant select on public.offer_submission_events to authenticated;
create policy "Admins read submission events" on public.offer_submission_events for select to authenticated
using (exists(select 1 from public.site_admins where user_id = (select auth.uid())));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('offer-screenshots','offer-screenshots',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy "Participants upload own screenshot" on storage.objects for insert to authenticated
with check (bucket_id='offer-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Participants and admins view private screenshots" on storage.objects for select to authenticated
using (bucket_id='offer-screenshots' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.site_admins where user_id=(select auth.uid()))));
create function public.offer_screenshot_attached(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.offer_submissions where screenshot_path=p_path)
    or exists(select 1 from public.offer_submission_events where screenshot_path=p_path);
$$;
revoke all on function public.offer_screenshot_attached(text) from public,anon;
grant execute on function public.offer_screenshot_attached(text) to authenticated;
create policy "Participants clean unattached uploads" on storage.objects for delete to authenticated
using (bucket_id='offer-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text and not public.offer_screenshot_attached(name));

create function public.submit_offer_proof(p_name text,p_email text,p_username text,p_screenshot text)
returns public.offer_submissions language plpgsql security definer set search_path='' as $$
declare result public.offer_submissions; previous public.offer_submissions; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'A secure session is required'; end if;
  -- Serialize submissions for the same identity, including initial inserts.
  perform pg_advisory_xact_lock(hashtext(uid::text));
  p_name:=trim(p_name);p_email:=null;p_username:=trim(p_username);
  if p_name is null or length(p_name) not between 2 and 100
     or p_username is null or length(p_username) not between 2 and 80 then raise exception 'Please check your name and Loomii username'; end if;
  if p_screenshot is null or p_screenshot !~ ('^'||uid::text||'/[0-9a-f-]+\.(png|jpg|webp)$') then raise exception 'Invalid screenshot path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='offer-screenshots' and name=p_screenshot) then raise exception 'Upload a screenshot before submitting'; end if;
  select * into previous from public.offer_submissions where user_id=uid for update;
  if found then
    if previous.status<>'rejected' then raise exception 'Your submission is already pending or approved'; end if;
    if previous.attempts>=5 then raise exception 'Submission limit reached. Please contact support'; end if;
    update public.offer_submissions set participant_name=p_name,email=p_email,loomii_username=p_username,screenshot_path=p_screenshot,
      status='pending',review_note='',submitted_at=now(),reviewed_at=null,reviewed_by=null,attempts=attempts+1
      where user_id=uid returning * into result;
  else
    insert into public.offer_submissions(user_id,participant_name,email,loomii_username,screenshot_path)
      values(uid,p_name,p_email,p_username,p_screenshot) returning * into result;
  end if;
  insert into public.offer_submission_events(submission_id,actor_id,event,screenshot_path)
    values(result.id,uid,'submitted',p_screenshot);
  return result;
end;
$$;
revoke all on function public.submit_offer_proof(text,text,text,text) from public,anon;
grant execute on function public.submit_offer_proof(text,text,text,text) to authenticated;

create function public.review_offer_submission(p_id uuid,p_status text,p_note text default '')
returns public.offer_submissions language plpgsql security definer set search_path='' as $$
declare result public.offer_submissions;
begin
  if not exists(select 1 from public.site_admins where user_id=auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status is null or p_status not in ('approved','rejected') or p_note is null or length(p_note)>2000 then raise exception 'Invalid review decision'; end if;
  if p_status='rejected' and length(trim(p_note))<3 then raise exception 'Give a reason for rejection'; end if;
  update public.offer_submissions set status=p_status,review_note=trim(p_note),reviewed_at=now(),reviewed_by=auth.uid()
    where id=p_id and status='pending' returning * into result;
  if not found then raise exception 'Submission was already reviewed. Refresh your inbox'; end if;
  insert into public.offer_submission_events(submission_id,actor_id,event,note,screenshot_path)
    values(result.id,auth.uid(),p_status,trim(p_note),result.screenshot_path);
  return result;
end;
$$;
revoke all on function public.review_offer_submission(uuid,text,text) from public,anon;
grant execute on function public.review_offer_submission(uuid,text,text) to authenticated;

-- Source: image-verification.sql
-- Run LAST: after schema.sql, offer-submissions.sql and any email-removal upgrade.

create table public.offer_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text unique not null default ('NL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  created_at timestamptz not null default now()
);
alter table public.offer_challenges enable row level security;
revoke all on public.offer_challenges from anon,authenticated;
grant select on public.offer_challenges to authenticated;
create policy "Own verification reference" on public.offer_challenges for select to authenticated using(user_id=(select auth.uid()));
create function public.get_offer_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare code_value text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.offer_challenges(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select code into code_value from public.offer_challenges where user_id=auth.uid();
  return jsonb_build_object('code',code_value,'review_text','My Loomii feedback reference: '||code_value);
end; $$;
revoke all on function public.get_offer_challenge() from public,anon;
grant execute on function public.get_offer_challenge() to authenticated;

create table public.screenshot_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  screenshot_path text not null unique,
  participant_name text not null,
  loomii_username text not null,
  sha256 text,
  normalized_hash text,
  perceptual_hash text,
  decision text not null default 'checking' check(decision in ('checking','blocked','review_required','error')),
  report jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index screenshot_checks_sha on public.screenshot_checks(sha256);
create index screenshot_checks_pixels on public.screenshot_checks(normalized_hash);
create index screenshot_checks_owner_time on public.screenshot_checks(user_id,created_at desc);
alter table public.screenshot_checks enable row level security;
revoke all on public.screenshot_checks from anon,authenticated;
grant select on public.screenshot_checks to authenticated;
create policy "Own checks and admin audit" on public.screenshot_checks for select to authenticated
using(user_id=(select auth.uid()) or exists(select 1 from public.site_admins where user_id=(select auth.uid())));
alter table public.offer_submissions add column image_check_id uuid references public.screenshot_checks(id);
alter table public.offer_submissions add column verification_report jsonb;

create function public.begin_offer_image_check(p_user uuid,p_path text,p_name text,p_username text)
returns public.screenshot_checks language plpgsql security definer set search_path='' as $$
declare result public.screenshot_checks;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  if (select count(*) from public.screenshot_checks where user_id=p_user and created_at>now()-interval '10 minutes')>=5 then raise exception 'Check limit reached'; end if;
  if p_path !~ ('^'||p_user::text||'/[0-9a-f-]+\.(png|jpg|webp)$') then raise exception 'Invalid image path'; end if;
  if exists(select 1 from public.offer_submissions where user_id=p_user and status in ('pending','approved')) then raise exception 'Already submitted'; end if;
  if not exists(select 1 from storage.objects where bucket_id='offer-screenshots' and name=p_path) then raise exception 'Missing upload'; end if;
  insert into public.screenshot_checks(user_id,screenshot_path,participant_name,loomii_username)
    values(p_user,p_path,p_name,p_username) returning * into result;
  return result;
end; $$;
revoke all on function public.begin_offer_image_check(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_offer_image_check(uuid,text,text,text) to service_role;

create function public.finish_offer_image_check(p_check uuid,p_sha text,p_pixels text,p_phash text,p_report jsonb,p_ok boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.screenshot_checks; previous public.offer_submissions; result public.offer_submissions; duplicate_found boolean;
begin
  select * into job from public.screenshot_checks where id=p_check for update;
  if not found or job.decision<>'checking' then raise exception 'Invalid check state'; end if;
  if p_sha is null or p_pixels is null or p_phash is null or p_sha !~ '^[a-f0-9]{64}$' or p_pixels !~ '^[a-f0-9]{64}$' or p_phash !~ '^[a-f0-9]{16}$' or p_report is null then raise exception 'Invalid image fingerprint'; end if;
  perform pg_advisory_xact_lock(hashtext(job.user_id::text));
  perform pg_advisory_xact_lock(hashtext(p_pixels));
  duplicate_found:=exists(select 1 from public.screenshot_checks where id<>p_check and decision='review_required' and (sha256=p_sha or normalized_hash=p_pixels));
  p_report:=p_report||jsonb_build_object('exact_duplicate',duplicate_found,'ai_generated','unverifiable','actual_installation','unverifiable','requires_human_review',true);
  update public.screenshot_checks set sha256=p_sha,normalized_hash=p_pixels,perceptual_hash=p_phash,report=p_report,
    decision=case when duplicate_found or not coalesce(p_ok,false) then 'blocked' else 'review_required' end where id=p_check;
  if duplicate_found then return jsonb_build_object('accepted',false,'error','This image has already been submitted. Use your own new screenshot.','report',p_report); end if;
  if not coalesce(p_ok,false) then return jsonb_build_object('accepted',false,'error','Image checks need attention. '||coalesce(p_report->'issues'->>0,'Use a clear screenshot with your reference.'),'report',p_report); end if;
  select * into previous from public.offer_submissions where user_id=job.user_id for update;
  if found then
    if previous.status<>'rejected' or previous.attempts>=5 then raise exception 'Submission is locked'; end if;
    update public.offer_submissions set participant_name=job.participant_name,loomii_username=job.loomii_username,email=null,
      screenshot_path=job.screenshot_path,status='pending',review_note='',submitted_at=now(),reviewed_at=null,reviewed_by=null,
      attempts=attempts+1,image_check_id=p_check,verification_report=p_report where id=previous.id returning * into result;
  else
    insert into public.offer_submissions(user_id,participant_name,loomii_username,screenshot_path,image_check_id,verification_report)
      values(job.user_id,job.participant_name,job.loomii_username,job.screenshot_path,p_check,p_report) returning * into result;
  end if;
  insert into public.offer_submission_events(submission_id,actor_id,event,screenshot_path)
    values(result.id,job.user_id,'image_checks_completed',job.screenshot_path);
  return jsonb_build_object('accepted',true,'submission',to_jsonb(result),'report',p_report);
end; $$;
revoke all on function public.finish_offer_image_check(uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.finish_offer_image_check(uuid,text,text,text,jsonb,boolean) to service_role;

-- Browser calls can no longer skip the trusted image checker.
revoke execute on function public.submit_offer_proof(text,text,text,text) from authenticated,anon,public;
create or replace function public.offer_screenshot_attached(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.offer_submissions where screenshot_path=p_path)
    or exists(select 1 from public.offer_submission_events where screenshot_path=p_path)
    or exists(select 1 from public.screenshot_checks where screenshot_path=p_path);
$$;
grant usage on schema public to service_role;
grant all on public.screenshot_checks to service_role;
grant select on public.offer_challenges to service_role;

commit;
