import './submissions.css';
export function renderSubmissions(container,client,demo) {
  const root=document.createElement('div');root.className='submissions-workspace';container.replaceChildren(root);
  root.innerHTML=`<div class="submission-toolbar"><label>Status<select id="submission-filter"><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All submissions</option><option value="blocked">Blocked image checks</option></select></label><label>Search this page<input type="search" id="submission-search" placeholder="Name, Loomii username…"></label><button class="button secondary" id="submission-refresh">Refresh ↻</button></div><p class="submission-status" role="status" aria-live="polite"></p><div class="submission-list"></div><div class="submission-pagination"><button class="button secondary" id="submission-prev">← Previous</button><span id="submission-page">Page 1</span><button class="button secondary" id="submission-next">Next →</button></div>`;
  const $=selector=>root.querySelector(selector);let rows=[],page=0,sequence=0,loading=false;
  const status=(text,error=false)=>{$('.submission-status').textContent=text;$('.submission-status').classList.toggle('error',error);};
  const el=(tag,text,className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
  function draw(){
    const list=$('.submission-list');list.replaceChildren();const term=$('#submission-search').value.trim().toLowerCase();
    const filtered=rows.filter(row=>`${row.participant_name} ${row.loomii_username} ${row.id}`.toLowerCase().includes(term));
    if(!filtered.length)list.append(el('p','No submissions found on this page.','submission-empty'));
    filtered.forEach(row=>{
      const card=el('article','','submission-card');const top=el('div','','submission-card-top');
      top.append(el('h3',row.participant_name),el('span',row.status,`submission-badge ${row.status}`));card.append(top);
      const details=el('dl','','submission-details');
      for(const [label,value]of [['Loomii username (self-reported)',row.loomii_username],['Submitted',new Date(row.submitted_at).toLocaleString()],['Reference',row.id],['Attempts',String(row.attempts)]]){details.append(el('dt',label),el('dd',value));}
      card.append(details);
      card.append(el('p','Screenshot received privately. Image previews are hidden in this inbox.','submission-review-note'));
      const actions=el('div','','submission-actions');
      const activity=el('button','View activity','button secondary');activity.addEventListener('click',async()=>{
        activity.disabled=true;try{const {data,error}=await client.from('offer_submission_events').select('event,note,created_at').eq('submission_id',row.id).order('created_at',{ascending:false});if(error)throw error;const log=el('div','','submission-activity');data.forEach(item=>log.append(el('p',`${new Date(item.created_at).toLocaleString()} · ${item.event}${item.note?' — '+item.note:''}`)));card.append(log);activity.remove();}catch(error){status(error.message,true);activity.disabled=false;}
      });actions.append(activity);card.append(actions);
      if(row.status==='pending'){
        const label=el('label','Review note / rejection reason');const note=document.createElement('textarea');note.maxLength=2000;note.rows=2;note.placeholder='Explain anything the participant needs to fix…';label.append(note);card.append(label);
        const decisions=el('div','','submission-actions');
        for(const [decision,title]of [['approved','Approve submission'],['rejected','Reject submission']]){
          const button=el('button',title,`button ${decision==='approved'?'primary':'secondary'}`);button.type='button';
          button.addEventListener('click',async()=>{
            if(decision==='rejected'&&note.value.trim().length<3){note.focus();status('Add a reason so the participant knows what to fix.',true);return;}
            if(!confirm(`${decision==='approved'?'Approve this submission':'Reject this submission'} for ${row.participant_name}?`))return;
            const buttons=card.querySelectorAll('button');buttons.forEach(item=>item.disabled=true);
            try{const {error}=await client.rpc('review_offer_submission',{p_id:row.id,p_status:decision,p_note:note.value});if(error)throw error;await load();status(`Submission ${decision}. ${decision==='approved'?'Your review decision is saved.':'The participant can submit an updated screenshot.'}`);}catch(error){status(error.message,true);buttons.forEach(item=>item.disabled=false);}
          });decisions.append(button);
        }card.append(decisions);
      }else{card.append(el('p',`${row.status==='blocked'?'Image checks blocked this upload.':'Reviewed'} ${row.reviewed_at?new Date(row.reviewed_at).toLocaleString():''}${row.review_note?' · '+row.review_note:''}`,'submission-review-note'));}
      list.append(card);
    });
    $('#submission-prev').disabled=page===0||loading;$('#submission-next').disabled=rows.length<25||loading;$('#submission-page').textContent=`Page ${page+1}`;
  }
  async function load(){
    if(demo||!client){status('Connect Supabase and apply offer-submissions.sql to see real submissions here. Demo mode does not create participant records.');draw();return;}
    const request=++sequence;loading=true;status('Loading submissions…');$('#submission-refresh').disabled=true;
    try{const blocked=$('#submission-filter').value==='blocked';let query=client.from(blocked?'screenshot_checks':'offer_submissions').select(blocked?'id,participant_name,loomii_username,created_at,decision':'id,participant_name,loomii_username,status,submitted_at,attempts,review_note,reviewed_at').order(blocked?'created_at':'submitted_at',{ascending:false}).order('id').range(page*25,page*25+24);if(blocked)query=query.eq('decision','blocked');else if($('#submission-filter').value!=='all')query=query.eq('status',$('#submission-filter').value);const {data,error}=await query;if(error)throw error;if(!root.isConnected||request!==sequence)return;rows=blocked?data.map(row=>({...row,status:'blocked',submitted_at:row.created_at,attempts:1,verification_report:row.report})):data;status(`${rows.length} submissions on this page. Loomii IDs are supplied by participants; screenshots require manual review.`);}
    catch(error){if(root.isConnected&&request===sequence){rows=[];status(error.message,true);}}
    finally{if(root.isConnected&&request===sequence){loading=false;$('#submission-refresh').disabled=false;draw();}}
  }
  $('#submission-filter').addEventListener('change',()=>{page=0;load();});$('#submission-search').addEventListener('input',draw);
  $('#submission-refresh').addEventListener('click',load);$('#submission-prev').addEventListener('click',()=>{page--;load();});$('#submission-next').addEventListener('click',()=>{page++;load();});load();
}
