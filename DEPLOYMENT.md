# Deploy Nutrilenz and its separate admin panel

You will have two Vercel projects connected to this one repository and one Supabase project shared by both:

| App | Example address | Build command | Output directory |
| --- | --- | --- | --- |
| Public website | `nutrilenz.vercel.app` | `npm run build` | `dist` |
| Admin panel | `nutrilenz-admin.vercel.app` | `npm run build:admin` | `dist-admin` |

These addresses are examples. Use the actual addresses assigned by Vercel. Both Vercel projects use the repository root (`./`), not the `admin` folder. The build commands produce separate applications; the public build does not contain the admin application.

## 1. Create the shared database

1. Sign in at [Supabase](https://supabase.com/dashboard) and create a project. Save its database password securely; the website does not need that password.
2. Open the project's **SQL Editor**, create a new query, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it **once**. It creates the content row, admin allowlist, revision history, and database access policies. Do not include the commented example admin insertion until you have created your user.
3. In the project's **Connect** dialog or **Settings → API / API Keys**, copy the project URL and the **publishable key** (or legacy **anon/public** key).
4. You need only the project URL and public key for these apps. **Do not put a secret key, `service_role` key, database password, or personal login password in `VITE_` variables or GitHub.** The public key is intentionally browser-visible; database policies restrict writes to your approved admin account.

## 2. Create your admin login

1. In Supabase, open **Authentication → Users → Add user → Create new user**.
2. Enter your own email address and a strong password. Enable **Auto Confirm User** if that option is offered. Save this password in your password manager.
3. Return to **SQL Editor** and run the following, replacing the email with the exact email you just used:

```sql
insert into public.site_admins (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do nothing;
```

4. Verify the allowlist entry:

```sql
select u.email, a.user_id
from public.site_admins a
join auth.users u on u.id = a.user_id;
```

Your email should appear. If the result is empty, check the spelling and confirm that the Auth user exists. There is no default admin email or hardcoded password.

5. In **Authentication → Sign In / Providers → Email** (dashboard wording may vary), disable new user signups if you will create all admin accounts manually. The application has no public signup form, and a normal signed-in account cannot publish without allowlist membership.

## 3. Deploy the public website on Vercel

1. Open [Vercel](https://vercel.com/new), choose **Add New → Project**, and import **aDiii1633/NUTRILENZ1**.
2. Name the project `nutrilenz` or choose another available name.
3. Set **Framework Preset** to **Vite**.
4. Keep **Root Directory** at `./`.
5. Override **Build Command** to `npm run build`.
6. Set **Output Directory** to `dist` and **Install Command** to `npm ci`.
7. Add these environment variables to **Production**:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL, e.g. `https://YOUR_PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase publishable key or legacy anon/public key |

8. Deploy and copy the actual public website URL.

## 4. Deploy the separate admin panel on Vercel

1. Create **another Vercel project**, importing the **same GitHub repository again**.
2. Name it `nutrilenz-admin` or another available name.
3. Set **Framework Preset** to **Vite** and **Root Directory** to `./`.
4. Override **Build Command** to `npm run build:admin`. This is the important difference.
5. Override **Output Directory** to `dist-admin`.
6. Use **Install Command** `npm ci`.
7. Add these environment variables to **Production**:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The SAME Supabase URL used by the public site |
| `VITE_SUPABASE_ANON_KEY` | The SAME Supabase public key used by the public site |
| `VITE_PUBLIC_SITE_URL` | The actual public website URL from step 3, including `https://` |

8. Deploy. The root URL of this second project is your admin panel. There is no need to append `/admin`.
9. In Supabase **Authentication → URL Configuration**, set **Site URL** to your actual admin URL. Password sign-in works without redirects; this setting also establishes the correct origin for future Auth email flows.
10. Open the deployed admin URL and sign in using the account from step 2.

Environment values are embedded during a Vite build. If you change a Vercel environment variable, **redeploy** that Vercel project. Content published through the admin does **not** need a rebuild.

For Preview environments, either leave the Supabase variables unset (publishing remains locked) or use a separate test Supabase project in BOTH preview apps. Do not casually connect preview admin apps to your production content.

## 5. Edit your website

1. Sign into Nutrilenz Studio.
2. In **Website settings**, set your actual **Task / offer destination URL** and **Support email**. No offer destination or real support mailbox is assumed by default. Until an offer URL is set, task buttons display a coming-soon message.
3. Adjust the reward, SEO title/description, dialog instructions, policy text, and accent color as needed.
4. Use the left navigation to edit the announcement, hero, task cards, calculator copy, completion steps, comparison, FAQs, CTA, and footer.
5. Changes are saved as an **unpublished draft in your current browser**. They are not shared across browsers until you publish. The editor keeps the page structure and card count; changing layouts, adding sections, adding task cards, or building payment processing requires a code change.
6. Press **Publish changes**. Wait for the green success message, then open or refresh the public website. Published content is stored in Supabase and is loaded on each page visit. Existing open pages need a refresh.
7. **Export backup** downloads a JSON file. **Import backup** puts that file into your draft; review and publish to apply it.
8. **Version history** shows the most recent 20 previous published versions. Restoring a version puts it into your draft; it only becomes live after you publish again.
9. If another browser publishes while you are editing, your old revision cannot overwrite it. Export your draft, discard to load the current version, and reapply the desired changes.

The reward setting updates the calculator and built-in ₹10 amounts. If you manually replace a reward with a different amount in a text field, keep that custom copy consistent yourself. The accent color controls accent text and selected brand elements; the supplied blue gradient artwork is preserved.

## 6. Optional custom domains

In each Vercel project's **Settings → Domains**, add the domain for that app:

- Public project: your domain, e.g. `nutrilenz.in`.
- Admin project: a subdomain, e.g. `admin.nutrilenz.in`.

Use the exact DNS records Vercel shows for your domain registrar. Once domains are active, update `VITE_PUBLIC_SITE_URL` in the admin project, redeploy the admin, and update the Supabase Auth Site URL. Domain ownership or availability is not assumed.

## 7. Verify the complete deployment

- The public project shows Nutrilenz; the admin project shows the sign-in screen.
- A visitor can read published content and use the calculator without signing in.
- Incorrect credentials are rejected. An Auth account without `site_admins` membership cannot enter the editor or publish.
- Your approved admin can publish a small text change. Refreshing the public site on another browser shows it.
- Sign out and confirm that the editor is no longer visible.
- Restore the earlier text using version history and publish again.
- Test the offer button and support link after configuring their real destinations.

## Local development

Use Node.js 22 or newer. From the repository root:

```sh
npm ci
npm run dev
```

In a second terminal:

```sh
npm run dev:admin
```

Website: `http://127.0.0.1:5173`. Admin: `http://127.0.0.1:5174`.

Copy `.env.example` to `.env.local` and fill in the Supabase values to test the connected workflow. Restart both development servers after changing env values. Without them, the admin offers a clearly labeled **local demo**. That demo is available only in development, saves content only to the admin origin's browser storage, and does not publish to the website on port 5173. Export a demo backup and import it into a connected editor to transfer it. Production has no demo publishing bypass.

```sh
npm test
npm run build:all
```

Tests cover content mapping, text injection prevention, URL validation, and Postgres row access/version-history behavior using an isolated local PGlite database. Supabase's hosted login and the final Vercel setup must still be checked after you configure your accounts.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Admin shows “Your studio is ready” | Add Supabase env variables and redeploy the admin project. |
| Admin shows the public website | Change its build command to `npm run build:admin` and output to `dist-admin`; root remains `./`. |
| “Not an approved administrator” | Insert your Auth user's ID into `site_admins` using the SQL above. |
| Table or relation not found | Run `supabase/schema.sql` in the SAME Supabase project used by both apps. |
| Invalid login credentials | Confirm email/password and that the Auth account is confirmed. Reset its password through your Supabase admin dashboard if needed. |
| Changes do not appear publicly | Publish, refresh, and compare both projects' Supabase URL/key. Drafts alone do not go live. |
| Conflict on publish | Export your draft, discard it to reload the latest published version, then reapply edits. |
| Theme color changes only some elements | Accent color is editable; the reference's gradient illustrations remain blue. |
| No offers open | Set the real offer destination in Website settings and publish. |

The admin manages website content. It does not provide task verification, user wallets, screenshot review, automatic UPI payouts, or an affiliate offer backend. Connect your actual offer provider through the configurable destination URL.

Official references: [Vercel multiple projects from one repository](https://vercel.com/docs/monorepos), [Supabase Auth](https://supabase.com/docs/guides/auth), [Supabase row level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
