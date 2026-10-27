# Activate screenshots and the admin inbox

The website has no database yet. Until this setup is complete, uploads stay disabled: no screenshot is silently discarded and no fake success redirects a visitor.

## 1. Create private storage

1. Create a project at https://supabase.com/dashboard/new and wait for it to finish provisioning.
2. Open SQL Editor. Run these files **once**, in order: `supabase/schema.sql`, `supabase/offer-submissions.sql`, `supabase/image-verification.sql`.
3. Enable **Authentication → Anonymous Sign-Ins** for visitors. Do not make the `offer-screenshots` bucket public.

## 2. Connect Vercel

In the public Vercel project's **Settings → Environment Variables**, add these to Production:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable or legacy public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key |
| `VITE_PUBLIC_SITE_URL` | `https://www.nutrilenz.in` |

Never paste the service role key into chat, source code, or a `VITE_` variable. Redeploy after adding the variables.

## 3. Create your admin

In Supabase Authentication, create your own confirmed email/password user. In SQL Editor run, using that email:

```sql
insert into public.site_admins(user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict(user_id) do nothing;
```

Open **https://www.nutrilenz.in/admin/** and sign in. **Offer submissions** shows participant names, Loomii IDs, timestamps, private screenshots, OCR warnings and review history. You can approve or reject with a reason. No default password is supplied. The separate admin deployment remains supported via `npm run build:admin`.

## 4. Check the real flow

Submit your own test screenshot, confirm it appears in the admin inbox, open its private preview and approve/reject it. Public visitors can never list another visitor's uploads. A successfully saved upload redirects to https://www.app20.in/; it is still awaiting your manual decision and is not a payment confirmation.

Decodable screenshots with missing OCR text/reference go to manual review. Exact duplicates and the illustrative example are blocked. If OCR fails, image decoding and fingerprinting still run and the admin sees an OCR-unavailable warning. This system cannot prove installation or reliably identify all AI images.
