import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createWorker } from 'tesseract.js';
import { reviewDraft } from '../offers/review-draft.js';
const require=createRequire(import.meta.url);
const eng=require('@tesseract.js-data/eng');
export const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
export function distance(a,b){if(!/^[a-f0-9]{16}$/i.test(a)||!/^[a-f0-9]{16}$/i.test(b))return 64;let n=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(n){count+=Number(n&1n);n>>=1n;}return count;}
export const normalizeText=text=>String(text||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
export function textSignals(text,reference){
  const normalized=normalizeText(text);
  return {loomii_visible:/LOOM[I1L]{2}/i.test(text),review_visible:/your\s+review|edit\s+your\s+review/i.test(text),install_ui_visible:/\bopen\b/i.test(text)&&/\buninstall\b/i.test(text),reference_matches:Boolean(reference)&&normalized.includes(normalizeText(reference)),example_watermark:/illustrative\s+example|demo\s+user/i.test(text)};
}
export async function fingerprintImage(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<20||bytes.length>5242880)throw new Error('Choose an image smaller than 5 MB.');
  const source=sharp(bytes,{limitInputPixels:24000000,failOn:'error'});
  const meta=await source.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw new Error('Use a single PNG, JPEG or WebP screenshot.');
  if(meta.width<240||meta.height<400)throw new Error('Screenshot is too small to read. Upload the full-size image.');
  const oriented=await source.rotate().removeAlpha().toColourspace('srgb').png().toBuffer();
  const decoded=await sharp(oriented).raw().toBuffer({resolveWithObject:true});
  const normalized_hash=sha256(Buffer.concat([Buffer.from(`${decoded.info.width}x${decoded.info.height}:`),decoded.data]));
  const thumb=await sharp(oriented).resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer();let bits=0n;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits=(bits<<1n)|BigInt(thumb[y*9+x]>thumb[y*9+x+1]?1:0);
  const metadataText=Buffer.concat([meta.exif||Buffer.alloc(0),meta.xmp||Buffer.alloc(0)]).toString('utf8');
  return {sha256:sha256(bytes),normalized_hash,perceptual_hash:bits.toString(16).padStart(16,'0'),width:decoded.info.width,height:decoded.info.height,synthetic_metadata_signal:/stable.?diffusion|midjourney|dall.?e|firefly|comfyui/i.test(metadataText),oriented};
}
// A heuristic for the supplied blue-star Google Play layout, never proof of a rating.
async function starSignal(image,words){
  const reviewWord=words.find(word=>/^review$/i.test(word.text)&&word.bbox.y0>100);
  if(!reviewWord)return {five_stars_signal:false,star_check:'uncertain'};
  const meta=await sharp(image).metadata();
  const top=Math.max(0,reviewWord.bbox.y1),height=Math.min(Math.ceil(meta.height*.12),meta.height-top);
  if(height<5)return {five_stars_signal:false,star_check:'uncertain'};
  const {data,info}=await sharp(image).extract({left:0,top,width:meta.width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<info.height;y++){
    const groups=[];let start=-1;
    for(let x=0;x<info.width;x++){
      const i=(y*info.width+x)*4;const blue=data[i+2]>125&&data[i+1]>85&&data[i+2]-data[i]>18;
      if(blue&&start<0)start=x;
      if((!blue||x===info.width-1)&&start>=0){if(x-start>=2&&x-start<meta.width*.05)groups.push([start,x]);start=-1;}
    }
    for(let i=0;i<=groups.length-5;i++){
      const five=groups.slice(i,i+5),widths=five.map(([a,b])=>b-a),centers=five.map(([a,b])=>(a+b)/2),gaps=centers.slice(1).map((c,j)=>c-centers[j]);
      if(Math.max(...widths)/Math.min(...widths)<2&&Math.max(...gaps)/Math.min(...gaps)<1.5&&five[4][1]-five[0][0]<meta.width*.45)return {five_stars_signal:true,star_check:'five_blue_shapes_near_review'};
    }
  }
  return {five_stars_signal:false,star_check:'uncertain'};
}
export async function inspectScreenshot(bytes,reference){
  const fingerprint=await fingerprintImage(bytes);
  const worker=await createWorker('eng',1,{langPath:eng.langPath,gzip:true,cacheMethod:'none',workerPath:require.resolve('tesseract.js/src/worker-script/node/index.js')});
  let timeout;
  try{
    await worker.setParameters({tessedit_pageseg_mode:'11'});
    const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Image reading timed out. Try a clearer, smaller screenshot.')),35000);});
    const result=await Promise.race([worker.recognize(fingerprint.oriented,{}, {text:true,blocks:true}),deadline]);
    const data=result.data;
    const words=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
    let signals=textSignals(data.text,reference);const stars=await starSignal(fingerprint.oriented,words);
    if(!signals.install_ui_visible){
      // A second high-contrast pass helps OCR read text inside filled Play buttons.
      const top=Math.floor(fingerprint.height*.24),height=Math.floor(fingerprint.height*.15);
      const buttons=await sharp(fingerprint.oriented).extract({left:0,top,width:fingerprint.width,height}).resize({width:1200}).greyscale().threshold(100).png().toBuffer();
      const second=await Promise.race([worker.recognize(buttons),deadline]);
      signals.install_ui_visible=textSignals(second.data.text,reference).install_ui_visible;
    }
    const issues=[];
    if(!signals.loomii_visible)issues.push('Loomii app title was not readable.');
    if(!signals.review_visible)issues.push('The Your Review / Edit your review section was not readable.');
    if(!signals.reference_matches)issues.push('Your assigned verification reference was not found.');
    if(signals.example_watermark)issues.push('Example images cannot be submitted as task evidence.');
    const {oriented,...hashes}=fingerprint;
    const review_text_matches=Boolean(reference)&&normalizeText(data.text).includes(normalizeText(reviewDraft(reference,false)));
    return {...hashes,report:{...signals,...stars,review_text_matches,assigned_review_text:reference?reviewDraft(reference):null,ocr_confidence:data.confidence,ocr_text:String(data.text).slice(0,12000),issues,ai_generated:'unverifiable',actual_installation:'unverifiable',synthetic_metadata_signal:fingerprint.synthetic_metadata_signal,requires_human_review:true},eligible_for_review:issues.length===0};
  }finally{clearTimeout(timeout);await worker.terminate();}
}
