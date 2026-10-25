-- Existing databases only: run after offer-submissions.sql. Keeps historical records.
begin;
alter table public.offer_submissions alter column email drop not null;
create or replace function public.submit_offer_proof(p_name text,p_email text,p_username text,p_screenshot text)
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

commit;

