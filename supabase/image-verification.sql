-- Run LAST: after schema.sql, offer-submissions.sql and any email-removal upgrade.
begin;
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
