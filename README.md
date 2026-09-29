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

Configure the repository secrets named in `.github/workflows/ci.yml`, give `CLOUDFLARE_API_TOKEN` permission to edit Workers and DNS/custom domains for the `currentflowconsulting.org` zone, and set `NEXT_PUBLIC_APP_URL=https://supplyr.currentflowconsulting.org` in the production environment. Apply Supabase migrations separately as an explicit release step. A committed npm lock file is used by GitHub Actions for dependency caching and `npm ci`.
