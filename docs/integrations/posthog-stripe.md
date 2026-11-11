# PostHog + Stripe — Phase 1 (sandbox)

This branch is an incremental integration, **not** a certified production billing system.

## PostHog
Root layout mounts `components/IntegrationsTelemetry.tsx`, tracking route views only, without query strings, customer names, chat messages or payment details. Session replay is OFF. The capture API is used without the full SDK; feature flags, heatmaps, and replay require a future SDK migration. Project/group isolation must be reviewed before rolling out to independent client apps.

Set in Vercel:
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` (project public token)
- `NEXT_PUBLIC_POSTHOG_HOST` (the PostHog project's ingestion URL)

## Stripe (test only)
- `STRIPE_SECRET_KEY` (must begin `sk_test_`)
- `STRIPE_TEST_PRICE_ID` (predefined test Price; do not accept client-supplied prices)
- `STRIPE_WEBHOOK_SECRET` (separate webhook signing secret)
- `NEXT_PUBLIC_APP_URL` (fixed HTTPS application base URL)
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The authenticated backend endpoint `POST /api/integrations/stripe/checkout` accepts an Authorization Bearer Supabase access token and returns the test Checkout URL for a server-defined Price. No production payment processing is enabled. The webhook verifies signatures but deliberately does **not** fulfill orders yet: checkout completion responds 503, requiring retry after a durable event ledger and tenant mapping have been implemented. Do not register this webhook for a live account.

## Blocking work before launch
- Confirm Stripe account eligibility and actual merchant business jurisdiction.
- Create test product and Price; provision secrets in Vercel securely.
- Persist payment events idempotently in Supabase with explicit `tenant_id`, owner checks and RLS, and connect payments to orders/invoices.
- Ensure success redirects never mark invoices paid, and verify test checkout, replayed webhooks, duplicate events, and cross-tenant isolation.
- Add a protected UI to initiate Checkout and run build/typecheck/E2E.
