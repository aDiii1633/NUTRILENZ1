# Activate screenshots and the admin inbox

The Supabase project has been created, and its supplied public key was verified against the Auth API. Live checks found that `site_content` and `offer_submissions` do not exist yet, and Anonymous Sign-In is disabled. The local `.env.local` now connects to the project; production settings and the server-only key are still required. Uploads stay disabled until setup is complete.

## 1. Create private storage

1. Open the [project SQL Editor](https://supabase.com/dashboard/project/wzncvkpvjxaabijbsefe/sql/new).
2. For this new project, paste and run **`supabase/bootstrap-new-project.sql` once**. It combines the three setup migrations in one transaction. Do not run both the bootstrap and the individual migrations. Existing databases require their appropriate individual migrations instead.
3. Enable **Authentication → Anonymous Sign-Ins** for visitors. Do not make the `offer-screenshots` bucket public.

## 2. Connect Vercel

In the public Vercel project's **Settings → Environment Variables**, add these to Production:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable or legacy public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key |
| `VITE_PUBLIC_SITE_URL` | `https://www.nutrilenz.in` |

Use `https://wzncvkpvjxaabijbsefe.supabase.co` as the URL and the public publishable key you supplied. This application uses Vite: map that key to `VITE_SUPABASE_ANON_KEY`; the name also accepts Supabase's newer publishable key format. Next.js `NEXT_PUBLIC_` names and SSR cookie middleware are not used here. `@supabase/supabase-js` is already installed; `@supabase/ssr` is unnecessary for this browser application.

Never paste the service role key into chat, source code, or a `VITE_` variable. Redeploy after adding the variables.

## 3. Create your admin

The public project's `/admin/` also supports a configured username login. The requested username and a scrypt password hash have been placed in Vercel's server-only `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` variables; no password is embedded in the frontend. Once the database SQL and `SUPABASE_SERVICE_ROLE_KEY` are configured, the first successful username login creates its confirmed Supabase account and allowlists it. Existing email/password admin sign-in is still supported. Without the schema/server key, username login returns a setup error and does not pretend to authenticate.

In Supabase Authentication, create your own confirmed email/password user. In SQL Editor run, using that email:

```sql
insert into public.site_admins(user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict(user_id) do nothing;
```

Open **https://www.nutrilenz.in/admin/** and sign in. **Offer submissions** shows participant names, Loomii IDs, timestamps, status and review history. At the owner's request, screenshot previews and OCR text are hidden; inbox queries fetch only metadata. Screenshots are still kept in private storage for verification. You can approve or reject with a reason. The separate admin deployment remains supported via `npm run build:admin`; username login on a separate deployment also requires the server-only variables there.

## 4. Check the real flow

Submit your own test screenshot, confirm it appears in the admin inbox, open its private preview and approve/reject it. Public visitors can never list another visitor's uploads. A successfully saved upload redirects to https://www.app20.in/; it is still awaiting your manual decision and is not a payment confirmation.

Decodable screenshots with missing OCR text/reference go to manual review. Exact duplicates and the illustrative example are blocked. If OCR fails, image decoding and fingerprinting still run and the admin sees an OCR-unavailable warning. This system cannot prove installation or reliably identify all AI images.
