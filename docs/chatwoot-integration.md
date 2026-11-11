# Chatwoot integration — Look Social Media CRM

Status: **adapter scaffold only**, not deployed or connected.

## Architecture

WhatsApp Cloud API → self-hosted Chatwoot → signed webhook receiver (to be implemented) → tenant-scoped CRM inbox → AI drafts/human approval → quotations/PayPal.

Chatwoot must run as a separate service with PostgreSQL, Redis, workers, persistent storage and HTTPS. The existing Next.js Vercel deployment cannot host the entire Rails/Sidekiq Chatwoot stack.

## Environment variables (server only)

- `CHATWOOT_BASE_URL`: HTTPS base URL of our self-hosted Chatwoot instance
- `CHATWOOT_ACCOUNT_ID`: numeric Chatwoot account identifier
- `CHATWOOT_API_ACCESS_TOKEN`: private Chatwoot API access token
- `CHATWOOT_WEBHOOK_TOKEN`: separate long random secret for webhook verification

Never use `NEXT_PUBLIC_` for these values, commit secrets, or paste tokens into chat.

## Before enabling live traffic

1. Deploy and secure Chatwoot (PostgreSQL/Redis/Sidekiq, backups, HTTPS, updates).
2. Register a WhatsApp Cloud API inbox in Chatwoot using Meta's supported onboarding flow; verify the phone number and messaging eligibility.
3. Create a CRM-side mapping from (Chatwoot account ID, inbox ID) to the existing Look Social Media tenant ID. Reject events without an active mapping; do not route by untrusted payload tenant names.
4. Implement a protected webhook receiver with token validation, durable event deduplication and replay handling. Configure a secret-bearing webhook URL only in Chatwoot. A bare public webhook URL must not be trusted.
5. Persist incoming messages under tenant RLS, map contacts/conversations, avoid duplicate messages and protect against cross-tenant access.
6. Enable outbound replies only with server-side authorization and Chatwoot conversation ownership checks.
7. Connect AI drafting with human approval first; prevent fabricated product prices and unauthorized payments.
8. Run an actual phone-to-CRM and CRM-to-phone end-to-end test before any client demonstration.
9. Disable YCloud routing only after verified Chatwoot cutover.

The initial adapter in `lib/chatwoot.ts` is intentionally server-only and makes **no** automatic outbound calls. No live WhatsApp integration is claimed.
