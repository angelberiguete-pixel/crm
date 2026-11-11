# CRM · Centro de automatizaciones y agentes (MVP incremental)
This is an **internal CRM module**, not a separate SaaS. Existing tenant identity and membership remain authoritative. Family Power stays out of scope.
## Audit / choices
- Reuse Supabase Auth/Postgres/RLS already in CRM; do not create a second identity system.
- n8n / Activepieces: external workflow engines through narrowly scoped server-side adapters, pending license and deployment review.
- Dify / Flowise / LangGraph: optional agent runtimes; avoid bundling all three.
- Appsmith: separate internal admin UI only if needed; not a prerequisite.
- MCP: allowlisted server-side tools, per-tenant scopes, no raw arbitrary tool execution.
- Catalog of 400 is candidate inventory, not 400 vetted dependencies.
## Proposed stages
1. Deny-by-default policy and negative tests (this PR).
2. Review existing migrations and policies; add tenant-scoped agent_definitions, agent_runs, approvals, provider_connections (secret references only), execution_events, usage_ledgers, workflow_templates. RLS and grants must be independently tested with two tenants.
3. Server API derives user identity from validated session, resolves tenant membership from DB, checks feature flag, quotas, allowed tool list, approval record, and idempotency key. Never trust client-supplied role, tenant membership or approved boolean.
4. Worker with timeout, budget, retry/backoff, cancellation, audit events, and explicit disabled provider state. First real agent: read-only lead summarizer using **synthetic** lead fixtures, verified output stored in staging only.
5. CRM UI: catalog, runs, approvals, usage, integrations; statuses distinguish connected, draft and unavailable.
6. CI: unit tests, RLS cross-tenant tests, API authorization, browser smoke; staging deployment only after security gate and Vercel permissions.
## Commercial priorities
1. Lead qualification and follow-up suggestions; 2. quote draft assistance (human approval); 3. conversation summarization; 4. reminders; 5. reporting.
## Non-goals
No external AI provider is connected by this PR. No migration, runtime worker, credentials, or production deployment is included. This policy is a pure function only; API enforcement must be server-side.
## Test
node --experimental-strip-types --test tests/automation-hub-policy.test.mjs
