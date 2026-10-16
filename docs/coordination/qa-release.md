# QA release coordination — LOOK SOCIAL MEDIA CRM

## 2026-10-15, QA cycle (Santo Domingo)
- Branch: `qa/http-smoke-origin-gate-20261015`; PR #72: https://github.com/angelberiguete-pixel/crm/pull/72
- Production: Vercel latest READY on `main` SHA `0de5af0faea17dde21204496a6d8821af37f2445` (as checked this cycle). No QA merge/deploy.
- CI evidence: https://github.com/angelberiguete-pixel/crm/actions/runs/38840450779 failed at **Production smoke redirect origin regression**. Log: 10 behavior scenarios passed, obsolete static assertion expected `redirect: follow/manual` in smoke even after redirect control moved to `fetchSameOrigin`; remaining CI steps skipped.
- Corrective commit `8c2af219575af4e9e52d6f2d3d3c81ad912d5a78` updates static wiring assertions to require actual helper import/call and manual redirect policy. **CI result for this commit unverified at time of writing.** Do not merge until green.
- The separate `Production HTTP Smoke` run https://github.com/angelberiguete-pixel/crm/actions/runs/38840450763 passed, but checks production public routes, not PR E2E.
- QA test scope: 10 mock redirect cases plus local HTTP redirect behavior, no real credentials, no messages, no database writes. These tests are not authenticated tenant A/B or Android conversation E2E.
- Other pending risks: composite ON DELETE SET NULL FKs affecting NOT NULL tenant columns (PR #70 audit); PR #71 workflow scope; PR #18 conversations; PR #62 automations; provider integrations not proven.
- Next: inspect new PR #72 CI and job logs; address any failure; check mergeability, concurrent changes, and Vercel alias; never merge before CI green.
