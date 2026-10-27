# Loomii offer submissions

All main earning buttons open `/#offer` and launch one compact three-step dialog: **copy a feedback prompt and read instructions → download Loomii → enter name, Loomii ID and screenshot**. Only one step is visible at a time, with Back buttons and preserved form values. Steps fit common phone viewports; very small screens, the keyboard and enlarged text retain a scroll fallback. Opening the store does not prove installation. Prompts ask for real user-authored feedback and do not prescribe a rating or testimonial.

After server image decoding/duplicate checks and a confirmed saved pending/approved submission, the browser redirects to App20. OCR mismatches or unavailable OCR go to manual review instead of rejecting a decodable image. Duplicate/example images, upload errors or an unconfigured backend never redirect. Returning pending participants can continue using the App20 link. Screenshots remain private and final admin review stays pending; navigating to App20 is not approval or payment confirmation. No new migration is needed beyond the existing image verification setup. The public build includes the protected admin application at `/admin/`; see [SCREENSHOT-SETUP.md](SCREENSHOT-SETUP.md) for first-time activation.

**Google Play prohibits incentivized ratings/reviews. Requiring a five-star review in exchange for a reward risks action against Loomii. Review the campaign requirement before launch:** [Google Play ratings policy](https://support.google.com/googleplay/android-developer/answer/9898684?hl=en). The requested review copy is in `offers/flow.js`; database infrastructure can also be used for account/task proof without a rating condition.

## Activate the database

If you already ran the previous email-required version, run `supabase/remove-offer-email.sql` once to accept submissions without email. Historical records are preserved; new submissions always store a null email. New databases can use the updated `offer-submissions.sql` directly.

1. Complete the original `DEPLOYMENT.md` Supabase setup if not already done. The public and admin Vercel projects must use the SAME Supabase URL and public key.
2. Run `supabase/schema.sql` once if this is a new project. Do not rerun it on an existing configured database.
3. Run **`supabase/offer-submissions.sql` once** in the Supabase SQL Editor. This additive migration creates the submissions table, audit events, private screenshot bucket, access policies, and submit/review RPC functions.
4. Enable **Anonymous Sign-Ins** under Supabase Authentication settings. This creates an isolated visitor identity without asking participants for a password. The application does not verify their supplied Loomii account; the admin shows those fields as self-reported.
5. For a public campaign, configure Supabase's bot protection and rate limits before advertising. If CAPTCHA is enabled, a CAPTCHA widget/token must be integrated into anonymous sign-in; the current flow does not submit a CAPTCHA token. A visitor session can submit once, with up to five attempts after rejection. This is not a global per-person fraud prevention system.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to BOTH Vercel projects and redeploy. Never put service-role keys in browser variables.
7. Create your admin login and allowlist entry using `DEPLOYMENT.md`.
8. Publish/update the Privacy and Terms fields in Studio. Existing saved content can override the new default policy text; explain the screenshot collection and set a real support email for deletion requests.

## Admin review

Sign in to the separate Nutrilenz Studio deployment and open **Offer submissions**. The inbox defaults to pending submissions and supports status filtering, page navigation, and search within the loaded page.

Each record shows participant details, submission time, reference, attempt count and verification status. **View private screenshot** generates an expiring signed URL. **View activity** shows submission and review events.

- **Approve screenshot** marks a pending submission approved. App20 continuation after saving remains independent of this decision.
- **Reject submission** requires an explanatory note. The user sees it and can submit a replacement.
- Already-reviewed submissions cannot be reviewed twice; concurrent decisions are rejected.

Participants keep access through their browser's saved anonymous session and click **Check verification status** to refresh. Clearing browser data or switching devices loses that local session; there is no email-based recovery workflow. No email address is collected, and no email notifications are sent. All form submissions and status checks are real database calls; production never fakes a completed upload.

App20 is independent. Approval here unlocks the link but does not transfer a verified task, credit money, or guarantee that App20 will pay. App20's own eligibility, tasks and payout requirements apply. No UPI information is collected by Nutrilenz.

## Storage and retention

The `offer-screenshots` bucket is private. Participants can read their own images; only approved admins can read all submissions. Visitors cannot update their status or approve themselves. Old screenshots remain attached to audit events on resubmission. Unattached failed uploads may be removed by their owner. The website owner must handle deletion/retention requests through the Supabase dashboard; removing personal data is not exposed as an admin UI action in this version.

The new workflow does not change your existing content rows. Export content backups separately from database/storage backups: Studio's JSON content export does not include participant records or images.

## Validation

Run `npm test` and `npm run build:all`. Database tests use local Postgres (PGlite) with Supabase-compatible Auth/Storage stubs to exercise ownership, upload isolation, rejection/resubmission, admin approval, and audit preservation. After activating hosted Supabase, submit one real test screenshot, approve it in the admin inbox, refresh the participant view, and check that the claim link points to `https://www.app20.in/`.
