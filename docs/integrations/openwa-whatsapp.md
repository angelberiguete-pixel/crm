# OpenWA v5 -> CRM/ARM: bridge receive-only (3 noviembre 2026)

**STATUS: code prepared in a draft PR, NOT DEPLOYED, NO NUMBER CONNECTED.**
The bridge is deliberately a second provider, not a replacement for YCloud. It does not start an AI agent or send outbound messages.

## Verified scope
- Runtime: [OpenWA](https://github.com/open-wa/wa-automate-nodejs), unofficial WhatsApp Web automation. For this integration, pin `@open-wa/wa-automate@5.10.0` and `@open-wa/integration-webhook@5.10.0` and test exact versions on staging.
- Host: a persistent Node.js **22.21.1+** process with writable persistent disk, HTTPS egress and session storage. **Never host the browser on Vercel/Supabase Edge or commit QR/session files.**
- Inbound: OpenWA v5 webhook -> `supabase/functions/openwa-whatsapp-inbound` -> privileged RPC -> existing CRM contacts, conversations, messages and a **human-review task**.
- Security: HTTPS plus `X-Webhook-Secret` compared before JSON parsing, body bound to 256 KiB, session mapped to a manually verified `openwa_whatsapp_routes` row. Tenant IDs in webhooks are never trusted.
- Idempotency: `(session_id, external_message_id)` unique receipt. Neither duplicate events nor unknown sessions can create messages.
- No outgoing messages, campaigns, background AI replies, billable AI usage, channel connection or client access to the runtime's API.

## Provisioning procedure (staging first)
1. Review and apply `supabase/migrations/20261103150000_openwa_verified_whatsapp_routes.sql` in an isolated staging database; verify RLS/revocations and existing `channels`, `tenants`, `contacts`, `conversations`, `messages`, `tasks`, `meta_whatsapp_routes` and `ycloud_whatsapp_routes`. The migration does not insert/enable routes.
2. Deploy `supabase/functions/openwa-whatsapp-inbound` with JWT verification disabled **only** for this webhook endpoint and set the random `OPENWA_WEBHOOK_SECRET` server-side (>=32 characters). The function also needs Supabase's normal server-only URL/service-role key. Never expose those keys to the browser.
3. On the persistent host running OpenWA, create a working directory, copy `integrations/openwa/wa.config.mjs`, create private `.env` values using `.env.example` and a persisted storage volume. Export the private `.env` file into the shell first (`set -a; . ./.env; set +a`), then install pinned packages:
   `npm install @open-wa/wa-automate@5.10.0 @open-wa/integration-webhook@5.10.0`
   Start with `npx @open-wa/wa-automate@5.10.0 --config ./wa.config.mjs --session-id family-power-demo --host 127.0.0.1 --port 8080 --api-key "$OPENWA_API_KEY"`
   Work from the configuration directory. Monitor `http://127.0.0.1:8080/health` and do not expose the API/dashboard port publicly.
4. **With the number owner's explicit authorization**, scan the QR from WhatsApp -> Linked devices. Verify that the linked session belongs to the intended business number. Do not disconnect other linked services without a migration plan. Keep session credentials encrypted and private.
5. Only the platform operator (not a customer or a webhook) writes the `openwa_whatsapp_routes` record, recording the intended `tenant_id`, existing WhatsApp `channel_id`, verified session ID, actual business phone, `verified_at` and audit reference. Initially `is_enabled=false`. Make sure no YCloud or Meta route is enabled for the same channel. After QA, an operator can enable it and mark the corresponding channel connected.
6. Send one consented **text message** from a second phone with an established chat. Check exactly one contact, conversation, message, task, retry deduplication, and a second test from an unrelated tenant: zero leakage. Test missing/incorrect secrets (401), malformed JSON (400), oversized bodies (413), unknown session (no storage), and group/media/outbound events (ignored).
7. Add outbound behind a separate authenticated server command, role/assignment/recipient checks, explicit human approval, idempotency and license gate. Then and only then wire the CRM Inbox's Send button to this adapter. AI-generated replies must remain drafts until reviewed.

## Important limitations
- This is **not Meta's official WhatsApp Business API**. WhatsApp may restrict or ban automated accounts. Do not use a customer's production-critical number in a first experiment.
- OpenWA v5 is still identified by its licensing docs as an alpha release; validate behavior in staging. Package license is **H-DNH 1.1**, not MIT/Apache. Review the current terms for distributing/selling the integration.
- Current OpenWA docs state that sending to new conversations may require a Restricted/Insiders license. This PR does **not** implement sending.
- The documented v5 webhook envelope is `{webhookId,sessionId,event,payload,timestamp}`, where text is `payload.message.body`; the `--webhook` CLI flag alone does NOT configure v5 webhooks. The plugin in `wa.config.mjs` does.
- A separate Family Power deployment must receive this reviewed adapter in its **independent repository/database**; do not share one tenant's database keys with another. The CRM general patch alone does not modify Family Power.
- Follow all applicable consent, privacy and WhatsApp platform rules; no bulk unsolicited messaging.

References:
- https://openwa.dev/docs/guides/webhooks-for-business
- https://openwa.dev/docs/getting-started/easy-api
- https://openwa.dev/docs/licensing/pricing/
- https://github.com/open-wa/wa-automate-nodejs
