# Shared AI capabilities — isolated rollout (draft)
Version: 0.1.0

This is a **deny-by-default policy primitive**, not an installed agent or production security boundary.

- Family Power remains a separate application and database.
- Do not trust a tenant ID supplied by the browser. Resolve authenticatedTenantId server-side from verified identity and membership.
- Load policy from a server-controlled store; never accept enabled capabilities from a client request.
- Evaluate authorization at each API/tool boundary, not only in the UI.
- Browser automation requires sandboxing, allowlisted destinations, no production secrets, audit logging and human approval for writes.
- Security-audit tools are defensive only; do not give an agent unrestricted shell or credentials.
- Memory stores must be partitioned by customer, with tenant-scoped retrieval and deletion.
- No deployment, Supabase changes, dependencies or customer access is authorized by this draft.
- Before rollout: audit RLS/RBAC, API endpoints, policy persistence, migration strategy, rollback, independent staging, and negative cross-tenant integration tests.
- Run locally: `node --test tests/ai-capabilities-policy.test.mjs`.
