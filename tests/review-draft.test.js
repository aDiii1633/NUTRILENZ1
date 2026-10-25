import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDraft } from '../offers/review-draft.js';

test('review drafts contain copy-ready text and a stable unique server reference',()=>{
  const first=reviewDraft('NL-ABC123DEF456');
  assert.ok(first.length>100);
  assert.match(first,/Loomii/);
  assert.match(first,/Review reference: NL-ABC123DEF456/);
  assert.equal(first,reviewDraft('NL-ABC123DEF456'));
  assert.notEqual(first,reviewDraft('NL-123456ABCDEF'));
});
test('a draft is available before backend activation without claiming a verified reference',()=>{
  const preview=reviewDraft('browser-draft-seed',false);
  assert.match(preview,/Loomii/);
  assert.ok(!preview.includes('reference:'));
  assert.ok(!preview.includes('secure submissions'));
});
