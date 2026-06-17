# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `friday/development/agent_mesh` (latest) | ✅ Active |
| Older commits | ❌ Not supported |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: **nitishkumar44470@gmail.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

We will acknowledge within **48 hours** and aim to patch critical issues within **7 days**.

## Scope

In scope for security reports:
- Agent execution sandbox escapes (E2B / Firecracker isolation)
- CriticGate bypass techniques (jailbreaks that evade safety evaluation)
- Prompt injection attacks against any agent
- Authentication/authorization flaws in the FastAPI backend
- Secrets or credentials exposed in code, logs, or API responses
- DBOS workflow replay attacks
- Killswitch bypass

Out of scope:
- Denial of service via excessive API calls (rate limiting is planned, not yet enforced)
- Vulnerabilities in third-party dependencies without a working exploit against this project

## Security Architecture

- **CriticGate**: every medium/high-risk agent action is evaluated by a safety critic before execution (AUROC 1.000 on red-team eval suite)
- **E2B Sandboxing**: all LLM-generated code runs in Firecracker microVMs — host isolation is enforced at the hypervisor level
- **Human-in-the-Loop**: high-risk actions suspend the DBOS workflow and require explicit human approval
- **Killswitch**: a global flag halts all running workflows and drains the job queue immediately
- **Secret Manager**: all credentials are stored in Google Secret Manager — no hardcoded secrets
- **Audit Log**: every agent action, CriticGate decision, and approval is logged to BigQuery

## Dependency Policy

- Python dependencies are audited weekly with `pip-audit` via GitHub Actions
- Node dependencies are audited with `npm audit` on every PR
- CodeQL analysis runs on every push (Python + JavaScript)
- Gitleaks secret scanning runs on every push and PR
