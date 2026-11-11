# Security findings — 2026-11-04

Source: GitHub Actions run 41779753811, job 126408357871.
Command: npm audit --omit=dev --audit-level=high
Result: FAILED, exit code 1. Production dependency advisories: 3 (1 critical, 2 high).

- next 16.3.4: critical advisory range 16.0.0–16.4.0; npm audit suggests 16.4.5, requiring deliberate version upgrade and regression testing.
- sharp <0.35.5: high; npm audit suggests fix.
- source-map-js 1.0.0–1.2.1: high; npm audit suggests fix.

Do not merge or deploy as secure until remediated and tests pass.
No automated --force upgrade applied.
GitHub AI capability policy workflow completed successfully.
Supabase general CRM project ygipjqgyreeahslzorik: a read-only inspection of first 100 public tables returned rowsecurity=true for each inspected table. This does NOT prove tenant isolation, correct policies, or test role access. Family Power project was not queried.
