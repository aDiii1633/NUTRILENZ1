import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validateSubmission,validateScreenshot,MAX_SCREENSHOT_BYTES } from '../offers/shared.js';

test('submission details and screenshot types are validated',()=>{
  assert.deepEqual(validateSubmission({name:' Test Person ',email:'User@Example.com',username:' loomii-test '}),{name:'Test Person',email:'user@example.com',username:'loomii-test'});
  assert.throws(()=>validateSubmission({name:'A',email:'bad',username:'xx'}));
  assert.throws(()=>validateScreenshot({type:'image/svg+xml',size:100}));
  assert.throws(()=>validateScreenshot({type:'image/png',size:MAX_SCREENSHOT_BYTES+1}));
  assert.doesNotThrow(()=>validateScreenshot({type:'image/png',size:1000}));
});

test('submission ownership, screenshot isolation, manual approval and resubmissions',async()=>{
  const db=new PGlite();
  const admin='00000000-0000-0000-0000-000000000001';
  const participant='00000000-0000-0000-0000-000000000002';
  const stranger='00000000-0000-0000-0000-000000000003';
  const path=`${participant}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`;
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${admin}','admin@test.com'),('${participant}','person@test.com'),('${stranger}','stranger@test.com');
      create schema storage;grant usage on schema storage to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
      create function storage.foldername(name text) returns text[] language sql immutable as $$select array[split_part(name,'/',1)]$$;
      grant execute on function storage.foldername(text) to authenticated;`);
    await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../supabase/offer-submissions.sql',import.meta.url),'utf8'));
    await db.exec(`insert into public.site_admins values('${admin}');set role anon;`);
    await assert.rejects(db.query('select * from public.offer_submissions'),/permission denied/);
    await assert.rejects(db.query("select public.submit_offer_proof('Person','person@test.com','test', $1)",[path]),/permission denied/);
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${participant}';`);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('offer-screenshots',$1)",[`${stranger}/test.png`]),/row-level security/);
    await db.query("insert into storage.objects(bucket_id,name) values('offer-screenshots',$1)",[path]);
    const result=await db.query("select * from public.submit_offer_proof('Person','person@test.com','loomii-user',$1)",[path]);
    const id=result.rows[0].id;assert.equal(result.rows[0].status,'pending');
    await assert.rejects(db.query("update public.offer_submissions set status='approved'"),/permission denied/);
    await assert.rejects(db.query("select public.review_offer_submission($1,'approved','')",[id]),/Administrator access/);
    await assert.rejects(db.query("select public.submit_offer_proof('Person','person@test.com','loomii-user',$1)",[path]),/already pending or approved/);
    await db.exec(`set request.jwt.claim.sub='${stranger}';`);
    assert.equal((await db.query('select * from public.offer_submissions')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await db.exec(`set request.jwt.claim.sub='${admin}';`);
    assert.equal((await db.query('select * from public.offer_submissions')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await assert.rejects(db.query("select public.review_offer_submission($1,'rejected','')",[id]),/Give a reason/);
    await db.query("select public.review_offer_submission($1,'rejected','Please send a clearer screenshot')",[id]);
    await db.exec(`set request.jwt.claim.sub='${participant}';`);
    const second=`${participant}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg`;
    await db.query("insert into storage.objects(bucket_id,name) values('offer-screenshots',$1)",[second]);
    // Record function result as a single composite value so the RPC runs only once.
    await db.query("select public.submit_offer_proof('Person','person@test.com','loomii-user',$1)",[second]);
    const retried=(await db.query('select * from public.offer_submissions')).rows[0];assert.equal(retried.attempts,2);assert.equal(retried.status,'pending');
    await db.exec(`set request.jwt.claim.sub='${admin}';`);
    await db.query("select public.review_offer_submission($1,'approved','Verified')",[id]);
    await assert.rejects(db.query("select public.review_offer_submission($1,'approved','')",[id]),/already reviewed/);
    assert.equal((await db.query('select * from public.offer_submission_events')).rows.length,4);
    await db.exec(`set request.jwt.claim.sub='${participant}';`);
    assert.equal((await db.query('select * from public.offer_submissions')).rows[0].status,'approved');
    assert.equal((await db.query('delete from storage.objects returning *')).rows.length,0);
  }finally{await db.close();}
});
