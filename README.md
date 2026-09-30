# Supplyr

Supplyr is a standalone, multi-tenant material-request and procurement application for field teams. It follows the CurrentFlow family architecture: Next.js on Cloudflare, Supabase Auth/Postgres, and optional signed adapters for Stockr and Buildr.

## Workflow

`Request → approval → company rules → supplier split → purchasing review → PO → receiving → integrations`

The database is the security boundary. Every business row carries a `company_id`; composite foreign keys prevent cross-company references, and Supabase row-level security resolves membership from `auth.uid()`. Never accept a trusted tenant id from the browser.

## Local development

1. Copy `.env.example` to `.env.local` and add a Supabase URL and anonymous key.
2. Run the SQL migration with `supabase db push` (or paste it into a new Supabase project's SQL editor).
3. Install and start: `npm install && npm run dev`.

The dashboard has no hard dependency on the other CurrentFlow products. Buildr/Stockr integrations are disabled by default and use per-company configuration plus signed, idempotent webhook events. CurrentFlow SSO can be connected as an OIDC provider while Supabase membership remains authoritative for tenancy and roles.

## Security and roles

- **employee** creates and edits their own draft/rejected requests.
- **supervisor** approves, rejects, or edits submitted requests.
- **purchasing** applies sourcing rules, reviews generated supplier orders, issues POs, and receives goods.
- **admin** manages the company, catalog, people, rules, integrations, and all procurement operations.

Service-role credentials are server-only. Browser and route-handler access uses the user's Supabase session so RLS is always enforced. Audit records capture workflow mutations. Integration webhooks are HMAC signed and carry idempotency keys.

## Deployment

GitHub Actions validates every pull request and deploys `main` through OpenNext to Cloudflare Workers. The Worker is configured with the custom domain `supplyr.currentflowconsulting.org`, so a production deployment opens at **https://supplyr.currentflowconsulting.org** rather than a `workers.dev` URL. The `currentflowconsulting.org` zone must be active in the same Cloudflare account used by the deployment token; Wrangler creates and manages the required DNS record for the custom domain.

Configure the repository secrets named in `.github/workflows/ci.yml` and give `CLOUDFLARE_API_TOKEN` permission to edit Workers and DNS/custom domains for the `currentflowconsulting.org` zone. The workflow owns the canonical application URL, so it does not need to be duplicated in `.env.example` or configured as a separate secret. Apply Supabase migrations separately as an explicit release step. The committed bootstrap lock file provides the GitHub Actions cache key; CI uses `npm install` until the complete transitive lockfile can be generated from an unrestricted npm registry connection.

### Put Supplyr online

1. Create the Supabase project, apply `supabase/migrations/20260929000000_initial.sql`, and add the project's URL and anonymous key as the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` GitHub Actions secrets.
2. Add `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` with Workers and custom-domain permissions to GitHub Actions secrets. The Cloudflare account must own the `currentflowconsulting.org` zone.
3. Merge to `main`. The deployment job now builds the OpenNext worker before publishing it, then exposes the deployment at **https://supplyr.currentflowconsulting.org**.
4. To redeploy at any time, open **Actions → CI → Run workflow** on `main`. The production environment in GitHub links directly to the live application.
