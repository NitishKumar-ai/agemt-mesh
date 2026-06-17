## What does this PR do?

<!-- One paragraph — what changed and why -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Security fix
- [ ] CI/CD / infra
- [ ] Docs

## Testing

- [ ] Unit tests pass (`pytest tests/`)
- [ ] CriticGate eval passes (AUROC ≥ 0.95)
- [ ] Frontend builds (`npm run build`)
- [ ] Manually tested in dev server

## Security checklist

- [ ] No secrets or API keys in code
- [ ] New agent tools have correct `risk_level` set
- [ ] High-risk tools require human approval (`requires_approval=True`)
- [ ] No `shell=True` subprocess calls without sanitization
- [ ] No `eval()` or `exec()` on user-controlled input

## Google Cloud changes (if any)

- [ ] New GCP resources documented
- [ ] IAM permissions are least-privilege
- [ ] Secrets go through Secret Manager (not env vars in code)
- [ ] BigQuery audit logging covers new actions
