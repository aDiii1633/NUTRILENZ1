import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { fingerprintImage,inspectScreenshot,textSignals,distance } from '../server/image-checks.js';
import verifyHandler from '../api/verify-offer.js';

const example=readFileSync(new URL('../public/images/review-example.png',import.meta.url));
test('image decoder rejects non-images and preserves normalized fingerprints',async()=>{
  await assert.rejects(fingerprintImage(Buffer.from('<html>not an image, even if named .png</html>')));
  const first=await fingerprintImage(example);
  const encoded=await sharp(example).png({compressionLevel:9}).toBuffer();
  const second=await fingerprintImage(encoded);
  assert.equal(first.normalized_hash,second.normalized_hash);
  assert.notEqual(first.sha256,second.sha256);
  assert.equal(distance(first.perceptual_hash,second.perceptual_hash),0);
  const resized=await fingerprintImage(await sharp(example).resize({width:500}).png().toBuffer());
  assert.ok(distance(first.perceptual_hash,resized.perceptual_hash)<=4);
});
test('text matching requires a review section and the assigned reference',()=>{
  const result=textSignals('Loomii: Ask anonymously Open Uninstall Your Review My Loomii feedback reference: NL-ABC123DEF456','NL-ABC123DEF456');
  assert.equal(result.loomii_visible,true);assert.equal(result.review_visible,true);assert.equal(result.reference_matches,true);assert.equal(result.install_ui_visible,true);
  assert.equal(textSignals('Loomii: Your Review NL-OTHER','NL-ABC123DEF456').reference_matches,false);
});
test('real local OCR reads the example and does not call it genuine evidence',async()=>{
  const result=await inspectScreenshot(example,'NL-ABC123DEF456');
  assert.equal(result.report.loomii_visible,true);
  assert.equal(result.report.review_visible,true);
  assert.equal(result.report.install_ui_visible,true);
  assert.equal(result.report.example_watermark,true);
  assert.equal(result.report.five_stars_signal,true);
  assert.equal(result.report.ai_generated,'unverifiable');
  assert.equal(result.report.actual_installation,'unverifiable');
  assert.equal(result.eligible_for_review,false);
});
test('unconfigured hosted checker fails closed instead of trusting browser data',async()=>{
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try{let status,body;const response={setHeader(){},status(code){status=code;return this;},json(value){body=value;return value;}};
    await verifyHandler({method:'POST',headers:{authorization:'Bearer forged-client-result'},body:{valid:true}},response);
    assert.equal(status,503);assert.match(body.error,/not active/);
  }finally{if(previous!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});
test('OCR matches an assigned reference in a readable test fixture',async()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400"><rect width="800" height="1400" fill="white"/><g fill="black" font-family="Arial" font-size="30"><text x="40" y="150">Loomii: Ask anonymously</text><text x="40" y="400">Uninstall</text><text x="400" y="400">Open</text><text x="40" y="650">Your Review</text><text x="40" y="750">My Loomii feedback reference:</text><text x="40" y="810">NL-ABC123DEF456</text></g></svg>');
  const result=await inspectScreenshot(await sharp(svg).png().toBuffer(),'NL-ABC123DEF456');
  assert.equal(result.report.reference_matches,true);assert.equal(result.eligible_for_review,true);assert.equal(result.report.requires_human_review,true);
});
test('server-only checker gates old RPCs and atomically blocks duplicate content',async()=>{
  const db=new PGlite();const first='00000000-0000-0000-0000-000000000002',second='00000000-0000-0000-0000-000000000003';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${first}'),('${second}');
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql as $$select array[split_part(name,'/',1)]$$;`);
    for(const file of ['schema.sql','offer-submissions.sql','image-verification.sql'])await db.exec(readFileSync(new URL('../supabase/'+file,import.meta.url),'utf8'));
    const path1=`${first}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`,path2=`${second}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png`;
    await db.query("insert into storage.objects values('offer-screenshots',$1),('offer-screenshots',$2)",[path1,path2]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${first}'`);
    const c1=(await db.query('select public.get_offer_challenge() as value')).rows[0].value;
    assert.match(c1.code,/^NL-[A-F0-9]{12}$/);
    assert.equal((await db.query('select public.get_offer_challenge() as value')).rows[0].value.code,c1.code);
    await assert.rejects(db.query("select public.submit_offer_proof('Tester',null,'tester',$1)",[path1]),/permission denied/);
    await assert.rejects(db.query('select public.begin_offer_image_check($1,$2,$3,$4)',[first,path1,'Tester','tester']),/permission denied/);
    await db.exec(`set request.jwt.claim.sub='${second}'`);
    const c2=(await db.query('select public.get_offer_challenge() as value')).rows[0].value;
    assert.notEqual(c1.code,c2.code);assert.equal((await db.query('select * from public.offer_challenges')).rows.length,1);
    await db.exec('reset role;set role service_role');
    const job1=(await db.query('select * from public.begin_offer_image_check($1,$2,$3,$4)',[first,path1,'Tester One','test-one'])).rows[0];
    const report={loomii_visible:true,review_visible:true,reference_matches:true,issues:[]};
    const finish=async(id)=> (await db.query('select public.finish_offer_image_check($1,$2,$3,$4,$5,true) as value',[id,'a'.repeat(64),'b'.repeat(64),'c'.repeat(16),report])).rows[0].value;
    const accepted=await finish(job1.id);assert.equal(accepted.accepted,true);assert.equal(accepted.submission.status,'pending');assert.equal(accepted.report.ai_generated,'unverifiable');
    const job2=(await db.query('select * from public.begin_offer_image_check($1,$2,$3,$4)',[second,path2,'Tester Two','test-two'])).rows[0];
    const blocked=await finish(job2.id);assert.equal(blocked.accepted,false);assert.equal(blocked.report.exact_duplicate,true);
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${second}'`);
    assert.equal((await db.query('select * from public.offer_submissions')).rows.length,0);
    const visible=(await db.query('select * from public.screenshot_checks')).rows;assert.equal(visible.length,1);assert.equal(visible[0].decision,'blocked');
  }finally{await db.close();}
});
