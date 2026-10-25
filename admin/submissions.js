import './submissions.css';
export function renderSubmissions(container,client,demo) {
  const root=document.createElement('div');root.className='submissions-workspace';container.replaceChildren(root);
  root.innerHTML=`<div class="submission-toolbar"><label>Status<select id="submission-filter"><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All submissions</option></select></label><label>Search this page<input type="search" id="submission-search" placeholder="Name, email, Loomii username…"></label><button class="button secondary" id="submission-refresh">Refresh ↻</button></div><p class="submission-status" role="status" aria-live="polite"></p><div class="submission-list"></div><div class="submission-pagination"><button class="button secondary" id="submission-prev">← Previous</button><span id="submission-page">Page 1</span><button class="button secondary" id="submission-next">Next →</button></div>`;
  const $=selector=>root.querySelector(selector);let rows=[],page=0,sequence=0,loading=false;
  const status=(text,error=false)=>{$('.submission-status').textContent=text;$('.submission-status').classList.toggle('error',error);};
  const el=(tag,text,className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
  function draw(){
    const list=$('.submission-list');list.replaceChildren();const term=$('#submission-search').value.trim().toLowerCase();
    const filtered=rows.filter(row=>`${row.participant_name} ${row.email} ${row.loomii_username} ${row.id}`.toLowerCase().includes(term));
    if(!filtered.length)list.append(el('p','No submissions found on this page.','submission-empty'));
    filtered.forEach(row=>{
      const card=el('article','','submission-card');const top=el('div','','submission-card-top');
      top.append(el('h3',row.participant_name),el('span',row.status,`submission-badge ${row.status}`));card.append(top);
      const details=el('dl','','submission-details');
      for(const [label,value]of [['Email (self-reported)',row.email],['Loomii username (self-reported)',row.loomii_username],['Submitted',new Date(row.submitted_at).toLocaleString()],['Reference',row.id],['Attempts',String(row.attempts)]]){details.append(el('dt',label),el('dd',value));}
      card.append(details);const actions=el('div','','submission-actions');
      const view=el('button','View private screenshot ↗','button secondary');view.type='button';
      view.addEventListener('click',async()=>{
        view.disabled=true;
        try{const {data,error}=await client.storage.from('offer-screenshots').createSignedUrl(row.screenshot_path,60);if(error)throw error;
          const dialog=el('dialog','','screenshot-dialog');dialog.setAttribute('aria-label','Submitted screenshot');
          const close=el('button','×','close-dialog');close.setAttribute('aria-label','Close screenshot');close.addEventListener('click',()=>dialog.close());
          const image=document.createElement('img');image.alt=`Verification screenshot submitted by ${row.participant_name}`;image.src=data.signedUrl;image.referrerPolicy='no-referrer';
          image.addEventListener('error',()=>status('Screenshot could not be loaded. Close the viewer and try again.','error'));
          dialog.append(close,el('h2','Submission screenshot'),el('p','Private preview. This signed URL expires after 60 seconds.'),image);document.body.append(dialog);dialog.addEventListener('close',()=>{image.src='';dialog.remove();});dialog.showModal();
        }catch(error){status(error.message,true);}finally{view.disabled=false;}
      });actions.append(view);
      const activity=el('button','View activity','button secondary');activity.addEventListener('click',async()=>{
        activity.disabled=true;try{const {data,error}=await client.from('offer_submission_events').select('event,note,created_at').eq('submission_id',row.id).order('created_at',{ascending:false});if(error)throw error;const log=el('div','','submission-activity');data.forEach(item=>log.append(el('p',`${new Date(item.created_at).toLocaleString()} · ${item.event}${item.note?' — '+item.note:''}`)));card.append(log);activity.remove();}catch(error){status(error.message,true);activity.disabled=false;}
      });actions.append(activity);card.append(actions);
      if(row.status==='pending'){
        const label=el('label','Review note / rejection reason');const note=document.createElement('textarea');note.maxLength=2000;note.rows=2;note.placeholder='Explain anything the participant needs to fix…';label.append(note);card.append(label);
        const decisions=el('div','','submission-actions');
        for(const [decision,title]of [['approved','Approve & unlock step 2'],['rejected','Reject submission']]){
          const button=el('button',title,`button ${decision==='approved'?'primary':'secondary'}`);button.type='button';
          button.addEventListener('click',async()=>{
            if(decision==='rejected'&&note.value.trim().length<3){note.focus();status('Add a reason so the participant knows what to fix.',true);return;}
            if(!confirm(`${decision==='approved'?'Approve this screenshot and unlock the App20 step':'Reject this screenshot'} for ${row.participant_name}?`))return;
            const buttons=card.querySelectorAll('button');buttons.forEach(item=>item.disabled=true);
            try{const {error}=await client.rpc('review_offer_submission',{p_id:row.id,p_status:decision,p_note:note.value});if(error)throw error;await load();status(`Submission ${decision}. ${decision==='approved'?'Step 2 is now available to this participant.':'The participant can submit an updated screenshot.'}`);}catch(error){status(error.message,true);buttons.forEach(item=>item.disabled=false);}
          });decisions.append(button);
        }card.append(decisions);
      }else{card.append(el('p',`Reviewed ${row.reviewed_at?new Date(row.reviewed_at).toLocaleString():''}${row.review_note?' · '+row.review_note:''}`,'submission-review-note'));}
      list.append(card);
    });
    $('#submission-prev').disabled=page===0||loading;$('#submission-next').disabled=rows.length<25||loading;$('#submission-page').textContent=`Page ${page+1}`;
  }
  async function load(){
    if(demo||!client){status('Connect Supabase and apply offer-submissions.sql to see real submissions here. Demo mode does not create participant records.');draw();return;}
    const request=++sequence;loading=true;status('Loading submissions…');$('#submission-refresh').disabled=true;
    try{let query=client.from('offer_submissions').select('*').order('submitted_at',{ascending:false}).order('id').range(page*25,page*25+24);if($('#submission-filter').value!=='all')query=query.eq('status',$('#submission-filter').value);const {data,error}=await query;if(error)throw error;if(!root.isConnected||request!==sequence)return;rows=data;status(`${rows.length} submissions on this page. Email and Loomii IDs are supplied by participants; screenshots require manual review.`);}
    catch(error){if(root.isConnected&&request===sequence){rows=[];status(error.message,true);}}
    finally{if(root.isConnected&&request===sequence){loading=false;$('#submission-refresh').disabled=false;draw();}}
  }
  $('#submission-filter').addEventListener('change',()=>{page=0;load();});$('#submission-search').addEventListener('input',draw);
  $('#submission-refresh').addEventListener('click',load);$('#submission-prev').addEventListener('click',()=>{page--;load();});$('#submission-next').addEventListener('click',()=>{page++;load();});load();
}
