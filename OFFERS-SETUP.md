# Loomii offer submissions

All main earning buttons now open `/#offer`. Step 1 shows Loomii installation/account/review instructions and a screenshot form. Participants provide a name, email, Loomii username and PNG/JPEG/WebP screenshot (up to 5 MB). Screenshots are private and reviewed manually. Approval unlocks Step 2 with the requested App20 link. A successful upload alone never counts as approval.

**Google Play prohibits incentivized ratings/reviews. Requiring a five-star review in exchange for a reward risks action against Loomii. Review the campaign requirement before launch:** [Google Play ratings policy](https://support.google.com/googleplay/android-developer/answer/9898684?hl=en). The requested review copy is in `offers/flow.js`; database infrastructure can also be used for account/task proof without a rating condition.

## Activate the database

1. Complete the original `DEPLOYMENT.md` Supabase setup if not already done. The public and admin Vercel projects must use the SAME Supabase URL and public key.
2. Run `supabase/schema.sql` once if this is a new project. Do not rerun it on an existing configured database.
3. Run **`supabase/offer-submissions.sql` once** in the Supabase SQL Editor. This additive migration creates the submissions table, audit events, private screenshot bucket, access policies, and submit/review RPC functions.
4. Enable **Anonymous Sign-Ins** under Supabase Authentication settings. This creates an isolated visitor identity without asking participants for a password. The application does not verify their supplied email or Loomii account; the admin shows those fields as self-reported.
5. For a public campaign, configure Supabase's bot protection and rate limits before advertising. If CAPTCHA is enabled, a CAPTCHA widget/token must be integrated into anonymous sign-in; the current flow does not submit a CAPTCHA token. A visitor session can submit once, with up to five attempts after rejection. This is not a global per-person fraud prevention system.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to BOTH Vercel projects and redeploy. Never put service-role keys in browser variables.
7. Create your admin login and allowlist entry using `DEPLOYMENT.md`.
8. Publish/update the Privacy and Terms fields in Studio. Existing saved content can override the new default policy text; explain the screenshot collection and set a real support email for deletion requests.

## Admin review

Sign in to the separate Nutrilenz Studio deployment and open **Offer submissions**. The inbox defaults to pending submissions and supports status filtering, page navigation, and search within the loaded page.

Each record shows participant details, submission time, reference, attempt count and verification status. **View private screenshot** generates an expiring signed URL. **View activity** shows submission and review events.

- **Approve & unlock step 2** marks a pending submission approved.
- **Reject submission** requires an explanatory note. The user sees it and can submit a replacement.
- Already-reviewed submissions cannot be reviewed twice; concurrent decisions are rejected.

Participants keep access through their browser's saved anonymous session and click **Check verification status** to refresh. Clearing browser data or switching devices loses that local session; there is no email-based recovery workflow. An email is collected for identification, not used to send notifications. All form submissions and status checks are real database calls; production never fakes a completed upload.

App20 is independent. Approval here unlocks the link but does not transfer a verified task, credit money, or guarantee that App20 will pay. App20's own eligibility, tasks and payout requirements apply. No UPI information is collected by Nutrilenz.

## Storage and retention

The `offer-screenshots` bucket is private. Participants can read their own images; only approved admins can read all submissions. Visitors cannot update their status or approve themselves. Old screenshots remain attached to audit events on resubmission. Unattached failed uploads may be removed by their owner. The website owner must handle deletion/retention requests through the Supabase dashboard; removing personal data is not exposed as an admin UI action in this version.

The new workflow does not change your existing content rows. Export content backups separately from database/storage backups: Studio's JSON content export does not include participant records or images.

## Validation

Run `npm test` and `npm run build:all`. Database tests use local Postgres (PGlite) with Supabase-compatible Auth/Storage stubs to exercise ownership, upload isolation, rejection/resubmission, admin approval, and audit preservation. After activating hosted Supabase, submit one real test screenshot, approve it in the admin inbox, refresh the participant view, and check that the claim link points to `https://www.app20.in/`.
