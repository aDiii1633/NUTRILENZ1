# Screenshot verification and example image

## What is implemented

- An initially hidden **Show example image** dialog under the Rate and review instruction.
- An edited, explicitly illustrative screenshot using **DEMO USER** and a neutral avatar. The original private reviewer name/photo is not shipped.
- A persistent, database-issued reference for each visitor. Participants write their own actual experience and add the unique reference line; the website does not invent a positive user experience for them.
- Server-side PNG/JPEG/WebP decoding with byte, dimension, animation and decompression limits.
- Local English OCR using Tesseract, with packaged language data. Screenshot bytes are not sent to an external AI provider.
- Checks for a readable Loomii title, the Your Review/Edit your review section, and the assigned reference. Known example labels are blocked.
- Open/Uninstall text and a five-blue-star visual heuristic, shown as **signals**, not proof. The fallback button crop targets a typical English Google Play layout; other layouts can return uncertain.
- Server-computed SHA-256 and decoded-pixel hashes. PostgreSQL serializes checks for identical pixels to prevent concurrent duplicate submissions. Previously accepted exact or pixel-identical images are blocked globally, including across users.

The duplicate registry covers images processed through this checker. Uploads made before this migration need a separate fingerprint backfill to participate in historical duplicate comparisons.
- A perceptual hash comparison against the 300 most recent accepted checks. Similarity is flagged for manual comparison rather than automatically rejected: Play screenshots have similar layouts, and heavily cropped/edited copies can evade this heuristic.
- Admin reports and a **Blocked image checks** inbox filter. Private OCR text and images are visible only to the owner and allowlisted admins.
- Successful automatic checks create a pending submission. Only admin approval unlocks the claim link; the browser cannot call the old submit RPC to bypass checks.

## Limits that must remain explicit

**No screenshot proves that an app is installed on a particular phone.** Open/Uninstall text can be edited. Actual device/account verification requires cooperation from Loomii's backend, such as signed account/task events.

**No reliable universal AI-generated-image detector is implemented or claimed.** Known synthetic-tool metadata can be flagged when present, but it is easily removed. Absence of such metadata proves nothing. The admin report always keeps `ai_generated` and `actual_installation` as `unverifiable`.

OCR and star detection are fallible, and synthetic screenshots can contain correct text and a valid reference. These checks reduce simple reuse and irrelevant uploads; they do not eliminate fraud. Different encodings of visually identical screenshots can also differ slightly at the pixel level. Public anonymous campaigns additionally need server/account rate controls and appropriate bot protection. Current limits are five image checks per identity per ten minutes; creating a new identity can evade per-identity limits.

Reward-conditioned Play reviews still carry the Google Play policy risk described in `OFFERS-SETUP.md`. A unique reference is not a workaround for that policy.

## Activation

1. Complete the existing shared Supabase setup. No plugin installation is required; the Supabase SQL Editor can be used directly.
2. Run `supabase/image-verification.sql` **last**, after the base schema, offer migration and any email-removal migration. It adds challenges, checks, server-only functions and revokes browser access to the old submission RPC.
3. Add `SUPABASE_SERVICE_ROLE_KEY` to the PUBLIC website Vercel project's **server** environment. Never name it with a `VITE_` prefix or commit it. Keep `VITE_SUPABASE_URL` and the public anonymous key configured as before. The admin build does not need the service-role key.
4. Redeploy the public website. `api/verify-offer.js` uses Node, Sharp and Tesseract with bundled English data; no paid AI API key is used.
5. Verify hosted anonymous sessions, upload, OCR, duplicate rejection, the admin report and final approval with real test submissions. Also confirm that directly calling `submit_offer_proof` as a participant is denied.
6. For local API testing use the Vercel development runtime; Vite alone serves the frontend and does not run `/api/verify-offer`.

Until the database migration and server secret are configured, production fails closed and does not pretend images were checked. Browser-only demo mode cannot publish or approve real evidence.

Do NOT rerun `remove-offer-email.sql` after the image migration, since that earlier migration regrants the legacy submit RPC. If you accidentally do, rerun the revoke statement from the bottom of `image-verification.sql` before accepting uploads.

## Validation and asset provenance

`npm test` covers decoder rejection, re-encoding and resize fingerprints, actual local OCR on the anonymized example, assigned-reference matching, per-user challenge stability, row isolation, legacy RPC denial, and duplicate blocking. The example's install-button text and five-star shape result are evidence signals only.

Asset: `public/images/review-example.png`. Generated with the built-in imagegen edit tool from the user-supplied screenshot. Prompt: preserve the full Loomii screenshot and UI; replace the reviewer name with DEMO USER, replace the personal avatar with a neutral D avatar, and add ILLUSTRATIVE EXAMPLE without obscuring the review. Do not change other review content. The example must not be accepted as participant evidence.
