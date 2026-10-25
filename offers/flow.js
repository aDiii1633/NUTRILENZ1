import { getClient } from '../cms/client.js';
import { LOOMII_URL, CLAIM_URL, validateSubmission, validateScreenshot } from './shared.js';
import './offer.css';
import { reviewDraft } from './review-draft.js';

let draftSeed;
try { draftSeed=localStorage.getItem('nutrilenz:review-draft-seed');if(!draftSeed){draftSeed=crypto.randomUUID();localStorage.setItem('nutrilenz:review-draft-seed',draftSeed);} }
catch { draftSeed=crypto.randomUUID(); }

let client;
let record = null;
let challenge = null;
let working = false;
let previewUrl;
let requestVersion = 0;
const host = document.createElement('section'); host.className = 'offer-page'; host.hidden = true;
host.setAttribute('aria-labelledby','offer-heading');
host.innerHTML = `<div class="offer-wrap"><a class="offer-back" href="#">← Back to Nutrilenz</a><div class="offer-intro"><span class="eyebrow light">YOUR NEXT LITTLE WIN</span><h1 id="offer-heading" tabindex="-1">You have to complete<br><span>two steps.</span></h1><p>A little time. Two simple steps. Let’s get you started.</p></div><ol class="offer-progress" aria-label="Offer progress"><li id="progress-one" aria-current="step"><span>1</span> Complete & submit</li><li id="progress-two"><span>2</span> Claim your ₹10</li></ol><div id="offer-message" class="offer-message" role="status" aria-live="polite"></div><div id="offer-body"></div><p class="offer-disclaimer">Screenshots are reviewed by Nutrilenz. App20 is a separate website; its eligibility, tasks and payout terms apply. Nutrilenz approval does not guarantee an App20 payment.</p></div>`;
document.querySelector('main').append(host);
const $ = selector => host.querySelector(selector);
function message(text, error=false) {$('#offer-message').textContent=text;$('#offer-message').classList.toggle('error',error);}
function el(tag,text,className='') {const node=document.createElement(tag);node.textContent=text;node.className=className;return node;}
function clearPreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
function render() {
  clearPreview(); const body=$('#offer-body'); body.replaceChildren();
  const approved=record?.status==='approved';
  $('#progress-one').classList.toggle('done',approved);$('#progress-one').setAttribute('aria-current',approved?'false':'step');$('#progress-two').setAttribute('aria-current',approved?'step':'false');
  if(approved) {
    const panel=el('div','','offer-panel claim-panel');
    panel.append(el('span','✓','offer-approved'),el('span','STEP 2 / YOUR LITTLE EXTRA','offer-step-label'),el('h2','Claim your 10 rupees.'),el('p','Your screenshot has been approved. Continue to App20 to explore its current ₹10 offer and complete its claim requirements.'));
    const link=el('a','Claim your ₹10 ↗','button primary');link.href=CLAIM_URL;link.target='_blank';link.rel='noopener noreferrer';panel.append(link,el('small',`Nutrilenz reference: ${record.id}`));body.append(panel);return;
  }
  if(record?.status==='pending') {
    const panel=el('div','','offer-panel pending-panel');panel.append(el('span','◷','offer-approved'),el('h2','Your screenshot is in review.'),el('p','Your upload is saved. Step 2 unlocks after an administrator approves it. This is a manual review, not an automatic screenshot check.'),el('small',`Submission reference: ${record.id}`));
    const refresh=el('button','Check verification status ↻','button primary');refresh.type='button';refresh.addEventListener('click',()=>refreshRecord());panel.append(refresh);body.append(panel);return;
  }
  const panel=el('div','','offer-panel');
  panel.innerHTML=`<span class="offer-step-label">STEP 1 / DOWNLOAD & COMPLETE</span><h2>Start with Loomii.</h2><div class="loomii-download"><span class="offer-step-label">START HERE · GET THE APP</span><a class="button primary loomii-download-button" href="${LOOMII_URL}" target="_blank" rel="noopener noreferrer">Download Loomii on Google Play <span aria-hidden="true">↗</span></a><p>Tap to open Google Play and download Loomii.</p></div><ol class="offer-instructions"><li><b>Download the Loomii app.</b><span>Open the Google Play listing and install Loomii.</span></li><li><b>Create your user ID.</b><span>Open Loomii, create your account, and keep your username handy.</span></li><li><b>Rate and review on Google Play.</b><span>Submit your five-star review after using the app, then take a screenshot of your posted review.</span></li></ol><hr><h3>Submit your screenshot.</h3><p>Tell us who completed the task, then upload your review screenshot for manual verification.</p><form id="proof-form"><div class="offer-form-grid"><label>Your name<input name="name" autocomplete="name" minlength="2" maxlength="100" required placeholder="Your full name"></label></div><label>Loomii username / user ID<input name="username" autocomplete="off" minlength="2" maxlength="80" required placeholder="Your Loomii username"></label><label class="upload-label">App review screenshot<input id="proof-file" name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" required><span>PNG, JPEG or WebP · Maximum 5 MB</span></label><img id="proof-preview" alt="Selected screenshot preview" hidden><label class="offer-consent"><input name="consent" type="checkbox" required><span>I consent to Nutrilenz storing my name, Loomii username and screenshot for task verification. I have cropped out unrelated personal information.</span></label><p class="offer-form-error" role="alert" id="proof-error"></p><button class="button primary" id="submit-proof" type="submit">Submit for verification ↗</button></form>`;
  if(record?.status==='rejected') {
    const rejection=el('div','','offer-rejection');rejection.append(el('strong','Please update your submission.'),el('p',record.review_note || 'Your previous screenshot could not be verified. Check the instructions and upload a new screenshot.'));panel.prepend(rejection);
    for(const [field,key] of [['name','participant_name'],['username','loomii_username']])panel.querySelector(`[name="${field}"]`).value=record[key];
  }
  body.append(panel);
  const exampleButton=el('button','Show example image','button secondary example-image-button');
  exampleButton.type='button';exampleButton.addEventListener('click',()=>{
    const modal=document.createElement('dialog');modal.className='example-dialog';modal.setAttribute('aria-label','Example review screenshot');
    const close=el('button','×','close-dialog');close.setAttribute('aria-label','Close example image');close.addEventListener('click',()=>modal.close());
    const image=document.createElement('img');image.src='/images/review-example.png';image.alt='Illustrative Loomii review screenshot with a mocked Demo User identity.';
    modal.append(close,el('h2','Example screenshot'),el('p','Illustration only. Use your own screenshot and assigned reference, not this example.'),image);document.body.append(modal);modal.addEventListener('close',()=>modal.remove());modal.showModal();
  });
  panel.querySelector('.offer-instructions li:last-child').append(exampleButton);
  const reference=el('div','','verification-reference');
  reference.append(el('h3','Your review message'),el('p','Copy this draft and paste it into the Google Play review box. Use it only if it reflects your experience; edit it on Google Play if needed.'));
  const reviewMessage=challenge?reviewDraft(challenge.code):reviewDraft(draftSeed,false);
  const text=el('p',reviewMessage,'reference-text');reference.append(text);
  const copy=el('button','Copy review message','button primary');copy.type='button';
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(reviewMessage);copy.textContent='Review copied ✓';}catch{copy.textContent='Select and copy the review above';}});reference.append(copy);
  panel.querySelector('hr').before(reference);
  $('#submit-proof').disabled=!challenge;
  $('#proof-file').addEventListener('change',async event=>{
    clearPreview();$('#proof-preview').hidden=true;$('#proof-error').textContent='';
    try{const file=event.target.files[0];validateScreenshot(file);previewUrl=URL.createObjectURL(file);$('#proof-preview').src=previewUrl;$('#proof-preview').hidden=false;}
    catch(error){$('#proof-error').textContent=error.message;event.target.value='';}
  });
  $('#proof-form').addEventListener('submit',submitProof);
}
async function ensureSession() {
  client ||= getClient(false,true);
  if(!client)throw new Error('Screenshot submissions are not active yet. Please check back soon.');
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(data.session)return data.session.user;
  const response=await client.auth.signInAnonymously();
  if(response.error)throw new Error('Could not start your secure submission session. Please try again later.');
  return response.data.user;
}
async function refreshRecord() {
  if(working)return; working=true;const version=++requestVersion;message('Checking your submission…');
  try {await ensureSession();const assigned=await client.rpc('get_offer_challenge');if(assigned.error)throw new Error('Secure image checks are not active yet. Please check back soon.');challenge=assigned.data;const {data,error}=await client.from('offer_submissions').select('*').eq('user_id',(await client.auth.getSession()).data.session.user.id).maybeSingle();if(error)throw error;if(version!==requestVersion)return;record=data;render();message(data?.status==='approved'?'Step 1 approved. You can continue to step 2.':data?.status==='pending'?'Your submission is saved and awaiting admin verification.':'Follow the instructions below to complete step 1.');}
  catch(error){message(error.message,true);render();}finally{working=false;}
}
async function submitProof(event) {
  event.preventDefault();if(working)return;const form=event.currentTarget;$('#proof-error').textContent='';
  let path;
  try {
    const details=validateSubmission(Object.fromEntries(new FormData(form)));const file=form.elements.screenshot.files[0];validateScreenshot(file);
    if(!challenge)throw new Error('Your secure verification reference is not available yet. Please refresh and try again.');
    if(!form.elements.consent.checked)throw new Error('Please consent to storing your verification details.');
    // Decode before upload so renamed/non-image files are rejected.
    const bitmap=await createImageBitmap(file);if(bitmap.width>12000||bitmap.height>12000){bitmap.close();throw new Error('Screenshot dimensions are too large. Please use a smaller image.');}bitmap.close();
    working=true;$('#submit-proof').disabled=true;$('#submit-proof').textContent='Uploading screenshot…';
    const user=await ensureSession();const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];path=`${user.id}/${crypto.randomUUID()}.${ext}`;
    const upload=await client.storage.from('offer-screenshots').upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;
    $('#submit-proof').textContent='Checking screenshot…';
    const session=await client.auth.getSession();
    const response=await fetch('/api/verify-offer',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify({...details,path})});
    const result=await response.json().catch(()=>({error:'Image checking is temporarily unavailable. Please try again later.'}));
    if(!response.ok)throw new Error(result.error||'Screenshot could not be checked.');
    record=result.submission;path=null;render();message('Image checks completed. Your submission is now awaiting final admin verification.');
  }catch(error){if(path&&client)await client.storage.from('offer-screenshots').remove([path]);if($('#proof-error'))$('#proof-error').textContent=error.message;else message(error.message,true);}
  finally {working=false;if($('#submit-proof')){$('#submit-proof').disabled=false;$('#submit-proof').textContent='Submit for verification ↗';}}
}
export function routeOffer() {
  const open=location.hash==='#offer';
  document.querySelectorAll('main > section:not(.offer-page)').forEach(section=>section.hidden=open);
  document.querySelector('footer').hidden=open;host.hidden=!open;
  if(open){window.scrollTo(0,0);$('#offer-heading').focus({preventScroll:true});render();refreshRecord();}
  else{requestVersion++;clearPreview();}
}
window.addEventListener('hashchange',routeOffer);
