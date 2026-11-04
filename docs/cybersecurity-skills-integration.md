# Cybersecurity Skills integration (staging only)

Source: https://github.com/mukul975/Anthropic-Cybersecurity-Skills
License: Apache-2.0 (retain attribution and license when redistributing).
Selected reviewed instruction files:
- .agents/skills/implementing-devsecops-security-scanning/SKILL.md
- .agents/skills/implementing-llm-guardrails-for-security/SKILL.md

These are agent instruction documents, NOT installed scanners, a runtime firewall, or automatically enabled CRM functionality.
They are intentionally added without executable upstream scripts or broad security agent privileges.
No production deployment or Family Power change has been made.

Before runtime activation: verify instructions and referenced dependencies; create a staging-only defensive CI workflow; restrict network, credentials, tool execution and tenant access; run tests and record findings.
