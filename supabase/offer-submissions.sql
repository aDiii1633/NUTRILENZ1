-- Run AFTER schema.sql, in the SAME Supabase project used by the website/admin.
begin;
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
commit;
