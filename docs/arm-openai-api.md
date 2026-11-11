# OpenAI API as the ARM inference provider

The existing CRM on Vercel remains the frontend/backend and Supabase remains the data store. This change adds a **server-side inference adapter only**. It does not create a public AI endpoint or grant agents permission to change customer data.

## Required Vercel environment variables

- `OPENAI_API_KEY`: secret key from https://platform.openai.com/api-keys (never paste into chat or GitHub; never use `NEXT_PUBLIC_`).
- `ARM_OPENAI_MODEL`: a model ID enabled for the API project, chosen after checking price and quality.

Use the **Responses API**, not the retired Assistants API. The adapter sets `store:false`, caps output, validates message lengths, and applies a 25-second timeout. This does **not** replace privacy review or consent. Requests still travel to OpenAI.

## Required before exposing in CRM

1. Confirm OpenAI API billing, model access, and project spending limits.
2. Integrate with the ARM orchestration branch, keeping model/provider selection server-side.
3. Build a protected API endpoint verifying Supabase JWT and tenant membership/permissions with the existing RPCs; derive tenant ID server-side.
4. Retrieve only authorized tenant-scoped product/knowledge data; avoid unnecessary personal information in prompts.
5. Enforce per-tenant quotas, rate limiting, durable audit logs, prompt-injection defenses, human approval and idempotent tool execution.
6. Run typecheck, integration tests, two-tenant RLS tests and staging E2E; only then merge/deploy.

No API key has been configured, no real API call has been made, and no agent is yet active in production.
