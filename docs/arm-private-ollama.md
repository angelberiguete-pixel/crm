# Private ARM AI (Ollama + Qwen)

This is an **inference adapter only**. It does not expose an unauthenticated endpoint, execute CRM tools, or send customer messages.

## Server configuration (Vercel environment variables, never NEXT_PUBLIC_)

- `ARM_OLLAMA_URL`: HTTPS base URL of a private Ollama gateway (or HTTP loopback in local development). Do **not** expose an unprotected Ollama instance to the internet.
- `ARM_OLLAMA_MODEL`: exact installed Qwen model tag, e.g. `qwen3:4b` after confirming the model is available locally.
- `ARM_OLLAMA_TOKEN`: gateway bearer token, stored only on the server. The gateway must enforce authentication, rate limits and tenant-independent network controls.

Ollama running on a laptop or LAN is **not** reachable from Vercel by default. Use an authenticated HTTPS private gateway or run the application and model in the same private network. Do not put the model on Vercel serverless.

## Next steps before activation

1. Deploy Ollama on controlled hardware and download the permitted Qwen model; check license, RAM and concurrency.
2. Verify HTTPS gateway authentication, timeout and outbound network restrictions.
3. Add an authenticated server route that derives tenant ID from verified Supabase JWT and checks effective modules and permissions.
4. Retrieve tenant-scoped knowledge with RLS, sanitize prompt inputs, add token budgets and audit logs.
5. Bind tool calls to the existing CRM/ARM action planner with server-side approval and idempotent jobs.
6. Test with two tenants, malicious prompts, unavailable model, repeated webhooks, and forbidden approvals.

No provider credentials, model download, external service, database migration or production deployment is performed by this PR.
