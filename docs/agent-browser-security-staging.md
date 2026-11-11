# Isolated Agent Browser + defensive security staging plan

Status: NOT INSTALLED. No production or Family Power deployment.

## Preconditions
1. GitHub PR #132 policy tests and typecheck pass.
2. Review server-side authenticated membership and Supabase RLS in a disposable database.
3. Configure separate staging environment, no production credentials.
4. Pin upstream versions and review dependency tree, license, release integrity and advisories.

## Agent Browser
- Execute in a disposable container with non-root user, restricted egress, no access to metadata endpoints or internal network.
- Only allow test origins and synthetic accounts; no unrestricted URL navigation.
- Disable file downloads/uploads and external actions unless specifically approved.
- Per-run tenant-scoped ephemeral browser profiles; never share cookies or sessions.
- Record tool invocations and require human confirmation for any write.

## Defensive tools
- Begin with read-only static code/config checks and dependency audits.
- Never expose production secrets, unrestricted shell, or cross-tenant database credentials to an agent.
- Keep findings and audit logs tenant-scoped; redact sensitive fields.

## Blocking security acceptance criteria
- A Family Power user/agent cannot read, create, modify or delete another tenant's records via API or database.
- A forged client tenantId does not grant access.
- Missing/expired session, disabled capability, missing policy or revoked membership all fail closed.
- RLS checks run against disposable PostgreSQL with two synthetic tenants; browser stubs do not count.
- No release until independent review and rollback validation.
