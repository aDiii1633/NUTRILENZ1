import { getClient } from '../cms/client.js';
import { CLAIM_URL, validateSubmission, validateScreenshot, canContinueToClaim } from './shared.js';
import './offer.css';
import './wizard.css';
import { renderWizard } from './wizard.js';
import { nextFeedbackSeed } from './review-draft.js';

let draftSeed;
try { draftSeed=localStorage.getItem('nutrilenz:review-draft-seed');if(!draftSeed){draftSeed=crypto.randomUUID();localStorage.setItem('nutrilenz:review-draft-seed',draftSeed);} }
catch { draftSeed=crypto.randomUUID(); }
draftSeed=nextFeedbackSeed(draftSeed);
try {localStorage.setItem('nutrilenz:review-draft-seed',draftSeed);}catch{}

let client;
let record = null;
let challenge = null;
let working = false;
let previewUrl;
let requestVersion = 0;
const wizardState={step:0,seed:draftSeed,downloadOpened:false,file:null};
const host = document.createElement('section'); host.className = 'offer-page offer-wizard-page'; host.hidden = true;
host.setAttribute('aria-labelledby','offer-heading');
host.innerHTML = `<div class="offer-wrap"><a class="offer-back" href="#">← Back to Nutrilenz</a><div class="offer-intro"><span class="eyebrow light">YOUR NEXT LITTLE WIN</span><h1 id="offer-heading" tabindex="-1">You have to complete<br><span>two steps.</span></h1><p>A little time. Two simple steps. Let’s get you started.</p></div><ol class="offer-progress" aria-label="Offer progress"><li id="progress-one" aria-current="step"><span>1</span> Complete & submit</li><li id="progress-two"><span>2</span> Claim your ₹10</li></ol><div id="offer-message" class="offer-message" role="status" aria-live="polite"></div><div id="offer-body"></div><p class="offer-disclaimer">Screenshots are reviewed by Nutrilenz. App20 is a separate website; its eligibility, tasks and payout terms apply. Nutrilenz approval does not guarantee an App20 payment.</p></div>`;
document.querySelector('main').append(host);
const $ = selector => host.querySelector(selector);
function message(text, error=false) {$('#offer-message').textContent=text;$('#offer-message').classList.toggle('error',error);}
function clearPreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
function render() {
  renderWizard({host,state:wizardState,ready:Boolean(challenge),record,submit:submitProof,refresh:refreshRecord});
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
  catch(error){if(version===requestVersion){message(error.message,true);render();}}finally{working=false;}
}
async function submitProof(event) {
  event.preventDefault();if(working)return;const form=event.currentTarget;$('#proof-error').textContent='';
  let path;
  try {
    const details=validateSubmission(Object.fromEntries(new FormData(form)));const file=wizardState.file||form.elements.screenshot.files[0];validateScreenshot(file);
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
    if(!canContinueToClaim(result))throw new Error('Your submission was not confirmed. Please try again.');
    record=result.submission;path=null;wizardState.file=null;render();message('Screenshot saved privately for admin review. Opening App20…');
    setTimeout(()=>window.location.assign(CLAIM_URL),1500);
  }catch(error){if(path&&client)await client.storage.from('offer-screenshots').remove([path]);if($('#proof-error'))$('#proof-error').textContent=error.message;else message(error.message,true);}
  finally {working=false;if($('#submit-proof')){$('#submit-proof').disabled=!challenge;$('#submit-proof').textContent='Submit & continue →';}}
}
export function routeOffer() {
  const open=location.hash==='#offer';
  document.querySelectorAll('main > section:not(.offer-page)').forEach(section=>section.hidden=open);
  document.querySelector('footer').hidden=open;host.hidden=!open;
  if(open){window.scrollTo(0,0);$('#offer-heading').focus({preventScroll:true});render();refreshRecord();}
  else{requestVersion++;document.querySelector('#offer-details-dialog')?.remove();document.querySelector('.example-dialog')?.remove();clearPreview();}
}
window.addEventListener('hashchange',routeOffer);
