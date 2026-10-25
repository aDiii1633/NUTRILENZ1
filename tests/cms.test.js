import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { collectFields, emptyContent, validateDocument, applyContent, safeUrl } from '../cms/model.js';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const doc = () => parseHTML(html).document;

test('public template and admin schema generate stable fields for every section', () => {
  const fields = collectFields(doc());
  assert.ok(fields.length > 100);
  assert.equal(new Set(fields.map(f => f.key)).size, fields.length);
  assert.deepEqual(fields.map(f => f.key), collectFields(doc()).map(f => f.key));
  assert.ok(fields.some(f => f.group === 'faq'));
  assert.ok(fields.some(f => f.group === 'tasks'));
  assert.ok(!fields.some(f => f.node.parentElement?.tagName === 'SCRIPT'));
});
test('publishing updates text and metadata without interpreting HTML', () => {
  const document = doc(), fields = collectFields(document), value = emptyContent();
  const field = fields.find(f => f.group === 'hero' && f.original.includes('Your spare minutes'));
  value.text[field.key] = '<img src=x onerror=alert(1)>';
  value.settings.title = 'Nutrilenz Test';
  value.settings.reward = 25;
  applyContent(document, fields, value);
  assert.equal(field.node.nodeValue.trim(), value.text[field.key]);
  assert.equal(document.querySelector('img[onerror]'), null);
  assert.equal(document.title, 'Nutrilenz Test');
});
test('unsafe link protocols and invalid rewards are rejected', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.example', 'https://user:password@example.com']) assert.equal(safeUrl(url), false);
  assert.equal(safeUrl('https://example.com/task'), true);
  assert.equal(safeUrl('#tasks'), true);
  const fields = collectFields(doc()), value = emptyContent();
  value.settings.offerUrl = 'javascript:alert(1)';
  assert.throws(() => validateDocument(value, fields), /Offer URL/);
  value.settings.offerUrl = ''; value.settings.reward = -1;
  assert.throws(() => validateDocument(value, fields), /Reward/);
  value.settings.reward = 10;
  value.text[fields.find(f => f.type === 'url').key] = 'javascript:alert(1)';
  assert.throws(() => validateDocument(value, fields), /Invalid link/);
});
test('empty database settings merge safe defaults; retired fields do not crash the site', () => {
  const content = validateDocument({schemaVersion:1,text:{retired:'example'},settings:{}},collectFields(doc()));
  assert.equal(content.settings.reward,10);
  assert.equal(content.settings.offerUrl,'');
  assert.deepEqual(content.text,{});
  assert.throws(() => validateDocument({schemaVersion:2,text:{},settings:{}},collectFields(doc())), /Unsupported/);
});
test('all brand names are Nutrilenz and source has no old offer destinations', () => {
  assert.ok(!/app20/i.test(html));
  assert.match(html, /Nutrilenz/);
});
