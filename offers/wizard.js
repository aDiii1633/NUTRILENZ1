import { LOOMII_URL, CLAIM_URL, validateScreenshot } from './shared.js';
import { reviewDraft, nextFeedbackSeed } from './review-draft.js';

export function renderWizard({host,state,ready,record,submit,refresh}) {
  const body=host.querySelector('#offer-body');
  const previous=body.querySelector('dialog');
  const wasOpen=previous?.open;
  previous?.remove();body.replaceChildren();
  const make=(tag,text,cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const resume=make('button','Continue your steps →','button primary');resume.type='button';body.append(resume);
  const modal=document.createElement('dialog');modal.id='offer-details-dialog';modal.className='offer-panel offer-wizard';modal.setAttribute('aria-labelledby','wizard-title');
  modal.innerHTML=`<header class="wizard-header"><span id="wizard-count" class="offer-step-label"></span><button type="button" class="wizard-close" aria-label="Close offer steps">×</button></header><h2 id="wizard-title" tabindex="-1"></h2><div class="wizard-dots" aria-label="Progress"><i></i><i></i><i></i></div><section data-stage="0"><ol class="wizard-first-instructions"><li>Try Loomii: share your link and receive anonymous messages.</li><li>Write your own honest feedback; capture your posted review.</li></ol><button class="wizard-example wizard-example-preview" type="button" aria-label="Open full example screenshot"><img src="/images/review-example.png" alt="Illustrative Loomii review screenshot with a Demo User identity" width="540" height="1200"><span>Show example <small>Open full screenshot ↗</small></span></button><p class="wizard-hint">A topic for your genuine feedback:</p><p class="wizard-prompt reference-text" aria-live="polite"></p><div class="wizard-copy-actions"><button class="button primary" type="button" id="wizard-copy">Copy prompt</button><button class="button secondary" type="button" id="wizard-shuffle">New topic ↻</button></div><button class="button primary wizard-next" type="button">Next: download app →</button></section><section data-stage="1" hidden><div class="wizard-app-icon" aria-hidden="true">L</div><p class="wizard-hint">Install Loomii from Google Play, create your account and keep your user ID ready.</p><a class="button primary loomii-download-button" href="${LOOMII_URL}" target="_blank" rel="noopener noreferrer">Download Loomii on Google Play ↗</a><p class="wizard-small">Return here after using the app. Opening the store cannot confirm installation.</p><button class="button primary wizard-next" type="button">Next: fill form →</button><button class="wizard-back" type="button">← Back</button></section><section data-stage="2" hidden><form id="proof-form"><label>Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Full name"></label><label>Loomii user ID<input name="username" autocomplete="off" required minlength="2" maxlength="80" placeholder="Your Loomii username"></label><label class="wizard-file">Your screenshot <span>PNG, JPEG, WebP · up to 5 MB</span><input id="proof-file" type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" required></label><p id="wizard-file-name" class="wizard-small"></p><label class="offer-consent"><input name="consent" type="checkbox" required><span>Save my name, user ID and screenshot privately for admin review. I removed unrelated personal details.</span></label><p id="proof-error" class="offer-form-error" role="alert"></p><p id="wizard-unavailable" class="wizard-small" role="status"></p><button class="button primary" id="submit-proof" type="submit">Submit & continue →</button></form><button class="wizard-back" type="button">← Back</button></section>`;
  body.append(modal);
  const $=s=>modal.querySelector(s);
  const steps=[...modal.querySelectorAll('[data-stage]')];
  const open=()=>{if(!modal.open)modal.showModal();};
  const show=step=>{state.step=step;steps.forEach((n,i)=>n.hidden=i!==step);$('#wizard-count').textContent=`STEP ${step+1} OF 3`;$('#wizard-title').textContent=['Prepare your feedback','Download Loomii','Send your screenshot'][step];modal.querySelectorAll('.wizard-dots i').forEach((n,i)=>n.classList.toggle('active',i<=step));modal.scrollTop=0;$('#wizard-title').focus({preventScroll:true});};
  let prompt=reviewDraft(state.seed,false);
  const updatePrompt=()=>{$('.wizard-prompt').textContent=prompt;$('#wizard-copy').textContent='Copy prompt';};updatePrompt();
  $('#wizard-shuffle').addEventListener('click',()=>{state.seed=nextFeedbackSeed(state.seed);prompt=reviewDraft(state.seed,false);try{localStorage.setItem('nutrilenz:review-draft-seed',state.seed);}catch{}updatePrompt();state.copied=false;});
  $('#wizard-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(prompt);state.copied=true;$('#wizard-copy').textContent='Copied ✓';}catch{$('#wizard-copy').textContent='Select text to copy';const range=document.createRange();range.selectNodeContents($('.wizard-prompt'));getSelection().removeAllRanges();getSelection().addRange(range);}});
  steps[0].querySelector('.wizard-next').addEventListener('click',()=>show(1));
  const download=steps[1].querySelector('a');const next=steps[1].querySelector('.wizard-next');next.disabled=!state.downloadOpened;
  download.addEventListener('click',()=>{state.downloadOpened=true;next.disabled=false;});next.addEventListener('click',()=>show(2));
  steps.slice(1).forEach((n,i)=>n.querySelector('.wizard-back').addEventListener('click',()=>show(i)));
  $('.wizard-close').addEventListener('click',()=>modal.close());resume.addEventListener('click',open);
  $('.wizard-example').addEventListener('click',()=>{const d=document.createElement('dialog');d.className='example-dialog';d.setAttribute('aria-label','Illustrative screenshot');const close=make('button','×','close-dialog');close.type='button';close.setAttribute('aria-label','Close example');close.addEventListener('click',()=>d.close());const img=make('img','');img.src='/images/review-example.png';img.alt='Illustrative Loomii screenshot with a Demo User identity.';d.append(close,make('h2','Example only'),img);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();});
  const form=$('#proof-form');
  for(const field of ['name','username']){form.elements[field].value=state[field]||'';form.elements[field].addEventListener('input',e=>state[field]=e.target.value);}
  form.elements.consent.checked=Boolean(state.consent);form.elements.consent.addEventListener('change',e=>state.consent=e.target.checked);
  $('#proof-file').required=!state.file;
  $('#wizard-file-name').textContent=state.file?.name||'';
  $('#proof-file').addEventListener('change',async e=>{const file=e.target.files[0];state.file=null;e.target.required=true;$('#proof-error').textContent='';try{validateScreenshot(file);const bitmap=await createImageBitmap(file);if(bitmap.width>12000||bitmap.height>12000){bitmap.close();throw new Error('Image dimensions are too large.');}bitmap.close();state.file=file;$('#wizard-file-name').textContent=file.name;}catch(error){e.target.value='';$('#wizard-file-name').textContent='';$('#proof-error').textContent=error.message;}});
  $('#submit-proof').disabled=!ready;$('#wizard-unavailable').textContent=ready?'Private upload · final decision by admin':'Uploads unavailable: the site owner must connect private storage.';
  form.addEventListener('submit',submit);
  if(record?.status==='rejected'){$('#proof-error').textContent=record.review_note||'Please upload an updated screenshot.';state.step=2;}
  show(state.step||0);
  if(record?.status==='pending'||record?.status==='approved'){
    steps.forEach(n=>n.hidden=true);$('#wizard-count').textContent='SUBMISSION SAVED';$('#wizard-title').textContent=record.status==='approved'?'Screenshot approved':'Waiting for admin review';
    const status=make('p',`Screenshot submitted successfully. Reference: ${record.id}`,'wizard-small'),link=make('a','Continue to App20 ↗','button primary');link.href=CLAIM_URL;modal.append(status,link);const check=make('button','Refresh review status','wizard-back');check.type='button';check.addEventListener('click',refresh);modal.append(check);
  }
  if(wasOpen!==false)open();
}
