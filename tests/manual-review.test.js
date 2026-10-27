import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inspectForManualReview } from '../server/manual-review.js';

const picture=()=>sharp({create:{width:400,height:700,channels:3,background:'#dedede'}}).png().toBuffer();
test('valid screenshots without an OCR match go to a human instead of being lost',async()=>{
  const result=await inspectForManualReview(await picture(),'NL-TEST',async()=>({report:{example_watermark:false,reference_matches:false,issues:['Text not found']},eligible_for_review:false}));
  assert.equal(result.eligible_for_review,true);assert.equal(result.report.requires_human_review,true);assert.equal(result.report.review_mode,'manual');
});
test('OCR failure retains fingerprints and accepts only decoded images for manual review',async()=>{
  const result=await inspectForManualReview(await picture(),'NL-TEST',async()=>{throw Error('OCR offline');});
  assert.equal(result.eligible_for_review,true);assert.equal(result.report.ocr_status,'unavailable');assert.match(result.normalized_hash,/^[a-f0-9]{64}$/);
  await assert.rejects(inspectForManualReview(Buffer.from('fake image'),'NL-TEST',async()=>({})));
});
test('illustrative example evidence is still blocked',async()=>{
  const result=await inspectForManualReview(await picture(),'NL-TEST',async()=>({report:{example_watermark:true},eligible_for_review:false}));assert.equal(result.eligible_for_review,false);
});
