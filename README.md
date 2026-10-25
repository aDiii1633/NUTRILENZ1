# Nutrilenz

A responsive rewards website and a separately deployable content administration app. The public design uses soft blue gradients, floating reward cards, an interactive calculator, and a large typographic footer.

**Start here: [complete Vercel + Supabase setup guide](DEPLOYMENT.md).**

## Applications

| Application | Local command | Production build | Output |
| --- | --- | --- | --- |
| Website | `npm run dev` | `npm run build` | `dist/` |
| Nutrilenz Studio | `npm run dev:admin` | `npm run build:admin` | `dist-admin/` |

Both use the repository root and share one Supabase content database. Deploy each as its own Vercel project. See `.env.example` for public connection variables; never commit secret credentials.

## What the admin edits

- Text and links across the existing page sections
- Task reward and earnings calculator rate
- Offer destination and support email
- SEO title/description, task dialogs, policy text, and accent color
- Browser-saved drafts, publish, JSON backup/import, and previous-version restore

Supabase email/password authentication and an explicit admin allowlist protect publishing. Database policies prevent anonymous or non-admin users from writing. Publishing uses revision checks to avoid overwriting another session's changes. Previous content is archived by a database trigger.

Without Supabase, the public site uses its built-in content and production admin publishing stays locked. Local development offers a browser-only editor demo. This is a content editor, not a drag-and-drop layout builder or payment processing system.

## Development and validation

Requires Node.js 22+.

```sh
npm ci
npm run dev
# In another terminal:
npm run dev:admin
```

```sh
npm test
npm run build:all
```

Tests exercise content editing, URL/text safety, and Postgres authorization/revision history with an isolated PGlite database. Hosted authentication and cross-domain publication require the Supabase setup in the guide.
