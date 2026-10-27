import template from '../index.html?raw';
import { configured, getClient } from '../cms/client.js';
import { collectFields, defaultSettings, emptyContent, validateDocument, safeUrl, DEMO_KEY } from '../cms/model.js';
import { renderSubmissions } from './submissions.js';

const $ = selector => document.querySelector(selector);
const client = getClient(true);
const fields = collectFields(new DOMParser().parseFromString(template, 'text/html'));
const groups = ['submissions', 'settings', ...new Set(fields.map(field => field.group))];
const names = {settings:'Website settings',announcement:'Announcement bar',navigation:'Navigation',hero:'Hero & floating cards','payment-strip':'Payment methods',tasks:'Task cards',calculator:'Earnings calculator','how-it-works':'How it works','comparison-section':'Comparison table',faq:'Questions & answers','cta-section':'Call to action',footer:'Footer'};
names.submissions = 'Offer submissions';
let draft = emptyContent(), published = emptyContent(), revision = 1, active = 'submissions', userId = '', demo = false, busy = false;
const clone = value => JSON.parse(JSON.stringify(value));
const dirty = () => JSON.stringify(draft) !== JSON.stringify(published);
const draftKey = () => `nutrilenz:draft:${demo ? 'demo' : userId}:v1`;
function notice(text, type = '') { $('#notice').textContent = text; $('#notice').className = `notice ${type}`; }
const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5173' : (location.pathname.startsWith('/admin/') ? location.origin : ''));
if (safeUrl(siteUrl, true)) $('#open-site').href = siteUrl;
else { $('#open-site').removeAttribute('href'); $('#open-site').textContent = 'Set VITE_PUBLIC_SITE_URL'; }

function updateState() {
  $('#draft-state').textContent = dirty() ? 'Unpublished changes' : 'Up to date';
  $('#draft-state').classList.toggle('unsaved', dirty());
  $('#publish').disabled = busy || !dirty(); $('#discard').disabled = busy || !dirty();
  $('#publish-title').textContent = demo ? 'Local demo workspace' : 'Publish when you’re ready.';
  $('#revision-label').textContent = demo ? 'Saved to this browser only. Export to transfer.' : `Published version ${revision} · Changes appear after a website refresh.`;
  $('#publish').textContent = busy ? 'Publishing…' : demo ? 'Save local demo ↗' : 'Publish changes ↗';
}
function saveDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify({document:draft, revision})); }
  catch { notice('Browser draft storage is full or unavailable. Export a backup before leaving.', 'error'); }
  updateState();
}
function makeField({key, label, value, original, type = 'text', hint = '', setting = false}) {
  const card = document.createElement('div'); card.className = `field-card${type === 'textarea' ? ' wide' : ''}`;
  const meta = document.createElement('div'); meta.className = 'field-meta';
  const kind = document.createElement('span'); kind.className = 'field-type'; kind.textContent = setting ? 'WEBSITE SETTING' : type === 'url' ? 'LINK DESTINATION' : 'PAGE CONTENT';
  const reset = document.createElement('button'); reset.className = 'reset-field'; reset.textContent = 'Reset field'; reset.type = 'button';
  meta.append(kind, reset); card.append(meta);
  const labelEl = document.createElement('label'); labelEl.append(document.createTextNode(label));
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (input.tagName === 'INPUT') input.type = type;
  input.value = value; input.dataset.field = key;
  input.maxLength = setting ? 12000 : 6000;
  if (type === 'number') {input.min = '1'; input.max = '10000'; input.step = '1';}
  labelEl.append(input); card.append(labelEl);
  if (hint) { const small = document.createElement('small'); small.textContent = hint; card.append(small); }
  function change() {
    if (setting) draft.settings[key] = type === 'number' ? Number(input.value) : input.value;
    else draft.text[key] = input.value;
    saveDraft();
  }
  input.addEventListener('input', change);
  reset.addEventListener('click', () => { input.value = original; if (setting) draft.settings[key] = original; else delete draft.text[key]; saveDraft(); });
  return card;
}
const settingSpecs = [
  ['title','Browser tab & SEO title','text',''],
  ['description','Search description','textarea','Search engines can take time to reflect changes.'],
  ['reward','Reward per task (₹)','number','Updates the calculator and default ₹10 reward amounts across the page.'],
  ['color','Brand accent color','color','Controls accent text and key brand elements; the reference’s blue gradients remain.'],
  ['offerUrl','Task / offer destination URL','url','Use the complete https:// link to your actual offer. Leave empty to show “coming soon”.'],
  ['supportEmail','Support email','email','Leave empty to send help links to the FAQ section.'],
  ['startTitle','Getting-started dialog heading','text',''],
  ['startDescription','Getting-started introduction','textarea',''],
  ['taskInstructions','Task instructions','textarea','One step per line. These instructions appear in the task dialogs.'],
  ['privacy','Privacy policy text','textarea','Replace with a policy that matches how your business uses visitor data.'],
  ['terms','Terms of use text','textarea','Set the terms for your actual offers and business.'],
];
function render() {
  const navigation = $('#sections'); navigation.replaceChildren();
  groups.forEach((group, index) => {
    const button = document.createElement('button'); button.className = `section-button${active === group ? ' active' : ''}`;
    button.setAttribute('aria-current', active === group ? 'page' : 'false');
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2,'0');
    button.append(number, document.createTextNode(names[group] || group));
    button.addEventListener('click', () => {active = group; render();}); navigation.append(button);
  });
  $('#section-title').textContent = names[active] || active;
  $('#section-description').textContent = active === 'settings' ? 'The details that make your website yours.' : 'Edit the text and links in this section. Your layout stays in place.';
  const container = $('#editor-fields'); container.replaceChildren();
  $('.publish-bar').hidden = active === 'submissions';
  $('.editor-bottom').hidden = active === 'submissions';
  $('#draft-state').hidden = active === 'submissions';
  if (active === 'submissions') {
    $('#section-description').textContent = 'Review private screenshots, see participant details, and unlock the claim step.';
    renderSubmissions(container, client, demo); return;
  }
  if (active === 'settings') settingSpecs.forEach(([key,label,type,hint]) => container.append(makeField({key,label,type,hint,value:draft.settings[key],original:defaultSettings[key],setting:true})));
  else fields.filter(field => field.group === active).forEach((field,index) => container.append(makeField({key:field.key,label:field.type === 'url' ? `Link ${index + 1} · ${field.node.textContent.trim().slice(0,55) || 'Home'}` : field.original,value:draft.text[field.key] ?? field.original,original:field.original,type:field.type === 'url' ? 'url' : field.original.length > 85 ? 'textarea' : 'text'})));
  updateState();
}
async function loadWorkspace() {
  busy = true;
  try {
    if (!demo) {
      const {data:member,error:membershipError} = await client.from('site_admins').select('user_id').eq('user_id',userId).maybeSingle();
      if (membershipError) throw membershipError;
      if (!member) throw new Error('This account is not an approved administrator. Add its user ID to site_admins using the setup guide.');
      const {data,error} = await client.from('site_content').select('document,revision').eq('id','main').single();
      if (error) throw error; published = validateDocument(data.document,fields); revision = data.revision;
    } else {
      published = localStorage.getItem(DEMO_KEY) ? validateDocument(JSON.parse(localStorage.getItem(DEMO_KEY)),fields) : emptyContent();
    }
    draft = clone(published);
    const saved = localStorage.getItem(draftKey());
    if (saved) {
      const previous = JSON.parse(saved); draft = validateDocument(previous.document, fields);
      if (previous.revision !== revision) {
        revision = previous.revision;
        notice('Your saved draft is based on an older version. Export it, then discard to load the latest version before merging your changes.', 'error');
      } else notice('Your saved draft has been restored. Review it before publishing.');
    } else notice(demo ? 'Local demo: content stays in this browser. Use Export backup to move it into your connected workspace.' : 'You’re signed in. Edit a section, then publish when you’re ready.', 'success');
    $('#auth-panel').hidden = true; $('#setup-panel').hidden = true; $('#editor-panel').hidden = false;
    $('#mode-label').textContent = demo ? 'Local demo · not live' : 'Connected workspace';
    $('#sign-out').hidden = demo; $('#history').hidden = demo;
  } finally { busy = false; render(); }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#login-error').textContent = ''; $('#login-button').disabled = true;
  try {
    const login=$('#email').value.trim();
    let response;
    if(login.includes('@'))response=await client.auth.signInWithPassword({email:login,password:$('#password').value});
    else{
      const result=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:login,password:$('#password').value})});
      const tokens=await result.json();if(!result.ok)throw new Error(tokens.error||'Could not sign in.');
      response=await client.auth.setSession(tokens);
    }
    const {data,error}=response;
    if (error) throw error; userId = data.user.id; $('#password').value = '';
    await loadWorkspace();
  } catch(error) { $('#login-error').textContent = error.message; notice(error.message,'error'); }
  finally { $('#login-button').disabled = false; }
});
$('#sign-out').addEventListener('click', async () => {
  const {error} = await client.auth.signOut();
  if (error) return notice(error.message,'error');
  draft = emptyContent(); published = emptyContent(); userId = ''; $('#editor-panel').hidden = true; $('#auth-panel').hidden = false; $('#sign-out').hidden = true; $('#sections').replaceChildren(); notice('You’ve signed out. Your unpublished draft is saved on this browser.');
});
$('#demo-button').addEventListener('click', async () => { demo = true; try { await loadWorkspace(); } catch(error) {notice(error.message,'error');} });
$('#publish').addEventListener('click', async () => {
  if (busy) return; busy = true; updateState();
  try {
    const clean = validateDocument(draft, fields);
    if (JSON.stringify(clean).length > 250000) throw new Error('Content is too large. Shorten long fields before publishing.');
    if (demo) localStorage.setItem(DEMO_KEY, JSON.stringify(clean));
    else {
      const {data,error} = await client.from('site_content').update({document:clean,revision:revision+1}).eq('id','main').eq('revision',revision).select('revision');
      if (error) throw error;
      if (!data?.length) throw new Error('Another session published a newer version, or your access changed. Export your draft, then discard it to reload the latest website.');
      revision = data[0].revision;
    }
    published = clone(clean); draft = clone(clean); localStorage.removeItem(draftKey());
    notice(demo ? 'Saved to the local demo. Export a backup to transfer these changes to your connected workspace.' : `Published version ${revision}. Refresh the public website to see your changes.`, 'success');
  } catch(error) {notice(error.message,'error');}
  finally {busy = false; updateState();}
});
$('#discard').addEventListener('click', async () => {
  if (!confirm('Discard your unpublished draft and load the latest published website?')) return;
  localStorage.removeItem(draftKey());
  try {await loadWorkspace();} catch(error) {notice(error.message,'error');}
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(draft,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download=`nutrilenz-content-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
});
$('#import').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 300000) throw new Error('Choose a content backup smaller than 300 KB.');
    const imported = validateDocument(JSON.parse(await file.text()),fields);
    if (dirty() && !confirm('Replace your current unpublished draft with this backup?')) return;
    draft = imported; saveDraft(); render(); notice('Backup imported into your draft. Review the sections and publish to apply it.');
  } catch(error) {notice(error.message,'error');}
  finally {event.target.value='';}
});
$('#history').addEventListener('click', async () => {
  try {
    const {data,error} = await client.from('content_history').select('id,document,revision,saved_at').order('id',{ascending:false}).limit(20);
    if (error) throw error;
    const list=$('#history-list'); list.replaceChildren();
    if (!data.length) {const p=document.createElement('p');p.textContent='Your first published change will create a version here.';list.append(p);}
    data.forEach(item => {
      const row=document.createElement('div');row.className='history-item';const label=document.createElement('div');label.textContent=`Version ${item.revision}`;
      const time=document.createElement('small');time.textContent=new Date(item.saved_at).toLocaleString();label.append(time);
      const restore=document.createElement('button');restore.className='button secondary';restore.textContent='Restore to draft';
      restore.addEventListener('click',()=>{try {if(dirty()&&!confirm('Replace your unpublished draft with this version?'))return;draft=validateDocument(item.document,fields);saveDraft();render();$('#history-dialog').close();notice('Previous version restored to draft. Publish to make it live.');}catch(error){notice(error.message,'error');}});
      row.append(label,restore);list.append(row);
    });
    $('#history-dialog').showModal();
  } catch(error) {notice(error.message,'error');}
});
$('.close-dialog').addEventListener('click',()=>$('#history-dialog').close());
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});

async function init() {
  if (!configured) { $('#setup-panel').hidden=false; $('#demo-button').hidden=!import.meta.env.DEV; notice('Connect Supabase to activate secure publishing. Your public website works with its built-in content.'); return; }
  try {
    const {data,error}=await client.auth.getSession(); if(error)throw error;
    if (data.session) {userId=data.session.user.id;await loadWorkspace();}
    else {$('#auth-panel').hidden=false;notice('Welcome back. Sign in with your administrator account.');}
  } catch(error) {$('#auth-panel').hidden=false;notice(error.message,'error');}
}
init();
