import { fingerprintImage, inspectScreenshot } from './image-checks.js';

// Decoding and duplicate detection remain mandatory. OCR is advisory for an
// administrator; missing text or an OCR outage must not discard a genuine upload.
export async function inspectForManualReview(bytes, reference, inspect = inspectScreenshot) {
  const {oriented,...fingerprint}=await fingerprintImage(bytes);
  try {
    const result=await inspect(bytes,reference);
    return {...fingerprint,...result,eligible_for_review:!result.report.example_watermark,report:{...result.report,review_mode:'manual',ocr_status:'complete',requires_human_review:true}};
  } catch {
    return {...fingerprint,eligible_for_review:true,report:{review_mode:'manual',ocr_status:'unavailable',issues:['Automatic text reading was unavailable. Check the screenshot manually.'],ai_generated:'unverifiable',actual_installation:'unverifiable',requires_human_review:true}};
  }
}
