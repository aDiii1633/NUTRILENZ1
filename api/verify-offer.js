import { createClient } from '@supabase/supabase-js';
import { distance } from '../server/image-checks.js';
import { inspectForManualReview } from '../server/manual-review.js';
import { validateSubmission } from '../offers/shared.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST.'});}
  const url=process.env.VITE_SUPABASE_URL;const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return res.status(503).json({error:'Image verification is not active yet. Please check back soon.'});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  let checkId;
  try{
    const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];
    if(!token)return res.status(401).json({error:'Your secure session has expired. Refresh and try again.'});
    const {data:auth,error:authError}=await db.auth.getUser(token);
    if(authError||!auth.user)return res.status(401).json({error:'Your secure session has expired. Refresh and try again.'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const details=validateSubmission(body||{});const path=body?.path;
    if(typeof path!=='string'||!new RegExp(`^${auth.user.id}/[0-9a-f-]+\\.(png|jpg|webp)$`).test(path))return res.status(400).json({error:'Invalid screenshot.'});
    const {data:challenge,error:challengeError}=await db.from('offer_challenges').select('code').eq('user_id',auth.user.id).single();
    if(challengeError||!challenge)return res.status(409).json({error:'Reload the page to get your verification reference first.'});
    const {data:job,error:jobError}=await db.rpc('begin_offer_image_check',{p_user:auth.user.id,p_path:path,p_name:details.name,p_username:details.username});
    if(jobError)return res.status(429).json({error:'Too many checks or this screenshot is already being processed. Wait a few minutes and try a new upload.'});
    checkId=job.id;
    const download=await db.storage.from('offer-screenshots').download(path);
    if(download.error||!download.data)throw new Error('The uploaded screenshot could not be opened.');
    const result=await inspectForManualReview(Buffer.from(await download.data.arrayBuffer()),challenge.code);
    const {data:recent,error:recentError}=await db.from('screenshot_checks').select('perceptual_hash').eq('decision','review_required').order('created_at',{ascending:false}).limit(300);
    if(recentError)throw new Error('Duplicate checks are temporarily unavailable.');
    result.report.similar_image_signal=(recent||[]).some(row=>distance(row.perceptual_hash,result.perceptual_hash)<=4);
    const finish=await db.rpc('finish_offer_image_check',{p_check:checkId,p_sha:result.sha256,p_pixels:result.normalized_hash,p_phash:result.perceptual_hash,p_report:result.report,p_ok:result.eligible_for_review});
    if(finish.error)throw new Error('The image check could not be saved. Please try again later.');
    if(!finish.data.accepted)return res.status(422).json({error:finish.data.error||'Screenshot could not be verified.',report:finish.data.report});
    return res.status(200).json({submission:finish.data.submission,report:finish.data.report});
  }catch(error){
    if(checkId)await db.from('screenshot_checks').update({decision:'error',report:{issues:['Image processing did not finish. Please submit a fresh upload.'],ai_generated:'unverifiable'}}).eq('id',checkId).eq('decision','checking');
    // Never log credentials, screenshots or private OCR text.
    return res.status(422).json({error:'Image checking did not finish. Use a clear full-size screenshot and try again.'});
  }
}
